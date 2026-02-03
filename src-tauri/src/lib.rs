#![allow(unsafe_code)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, State,
};

use std::time::{SystemTime, UNIX_EPOCH};
use std::sync::Mutex;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{HWND, RECT, LPARAM};
#[cfg(target_os = "windows")]
use windows::core::BOOL;
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE};
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Gdi::{MonitorFromWindow, GetMonitorInfoW, MONITORINFO, MONITOR_DEFAULTTONEAREST, EnumDisplayMonitors, HDC};

use std::time::Duration;
use sqlx::{mysql::MySqlPoolOptions, postgres::PgPoolOptions, sqlite::SqlitePoolOptions, MySqlPool, PgPool, SqlitePool};
use sqlx::{Column, Row, TypeInfo, ValueRef}; // For manual JSON conversion
use mongodb::{options::ClientOptions, Client};
use russh::client;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::Mutex as AsyncMutex;
use std::collections::HashMap;

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SshConfig {
    host: String,
    port: u16,
    username: String,
    #[serde(default)]
    password: Option<String>,
    #[serde(default)] // This ensures missing field in JSON becomes None
    #[allow(dead_code)]
    private_key_path: Option<String>,
}

#[derive(Clone)]
struct ClientHandler;

#[async_trait::async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;
    async fn check_server_key(&mut self, _key: &russh_keys::PublicKey) -> Result<bool, russh::Error> {
        Ok(true)
    }
}

struct AppState {
    redis_client: Mutex<Option<redis::Client>>,
    mysql_pool: Mutex<Option<MySqlPool>>,
    pg_pool: Mutex<Option<PgPool>>,
    sqlite_pool: Mutex<Option<SqlitePool>>,
    mongo_client: Mutex<Option<Client>>,
    ssh_sessions: Mutex<HashMap<String, Arc<AsyncMutex<client::Handle<ClientHandler>>>>>,
}

// ... (existing commands) ...

async fn establish_ssh_tunnel(
    ssh_config: SshConfig,
    remote_host: String,
    remote_port: u16,
) -> Result<(u16, Arc<AsyncMutex<client::Handle<ClientHandler>>>), String> {
    let config = client::Config::default();
    let config = Arc::new(config);
    let sh = ClientHandler;
    
    let mut session = client::connect(config, (ssh_config.host.as_str(), ssh_config.port), sh)
        .await
        .map_err(|e| format!("SSH Connect Error: {}", e))?;

    if let Some(pwd) = ssh_config.password {
        session.authenticate_password(ssh_config.username, pwd)
            .await
            .map_err(|e| format!("SSH Auth Error: {}", e))?;
    } else {
        return Err("Only password auth supported for now".to_string());
    }
    
    let session = Arc::new(AsyncMutex::new(session));
    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
    let local_port = listener.local_addr().map_err(|e| e.to_string())?.port();
    
    let loop_handle = session.clone();
    let r_host = remote_host.clone();
    let r_port = remote_port;

    tokio::spawn(async move {
        loop {
            if let Ok((stream, _)) = listener.accept().await {
                let handle = loop_handle.lock().await;
                let mut channel = match handle.channel_open_direct_tcpip(r_host.clone(), r_port as u32, "127.0.0.1", 0).await {
                    Ok(c) => c.into_stream(),
                    Err(e) => {
                        eprintln!("Failed to open channel: {}", e);
                        continue;
                    }
                };
                
                tokio::spawn(async move {
                    let mut stream = stream;
                    // channel needs key handling? No, generic.
                    let _ = tokio::io::copy_bidirectional(&mut stream, &mut channel).await;
                });
            } else {
                break; 
            }
        }
    });

    Ok((local_port, session))
}

#[tauri::command]
async fn connect_sqlite(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let url = format!("sqlite://{}", path);
    // Ensure the file exists? sqlite usually creates if not exists + create_if_missing(true)
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .map_err(|e| e.to_string())?;

    *state.sqlite_pool.lock().unwrap() = Some(pool);
    Ok("Connected to SQLite".to_string())
}

#[tauri::command]
async fn sqlite_get_tables(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let pool = {
        let guard = state.sqlite_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let rows: Vec<(String,)> = sqlx::query_as("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(name,)| name).collect())
}

#[tauri::command]
async fn sqlite_get_rows(state: State<'_, AppState>, table_name: String, limit: i64, offset: i64) -> Result<Vec<String>, String> {
    let pool = {
        let guard = state.sqlite_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    // 1. Fetch PK for stable ordering (convention: look for PK in PRAGMA table_info)
    // Or just "rowid" if not present? stick to simple for now.
    // Let's rely on default order or rowid if convenient.
    // Querying PRAGMA table_info is a bit structured. 
    // Let's just do simplistic Select. User can request stable sort later if needed.
    
    let q = format!("SELECT * FROM \"{}\" LIMIT {} OFFSET {}", table_name, limit, offset);
    
    let rows = sqlx::query(&q)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // Manual JSON conversion
    let mut json_rows = Vec::new();
    for row in rows {
        let mut map = serde_json::Map::new();
        for col in row.columns() {
            let name = col.name();
            // In SQLite, types are dynamic. We try to read based on storage class.
            // sqlx::Row::try_get is strongly typed. 
            // We can check type_info.
            // Simplified: Try Text, then others? 
            // Better: use `try_get_raw` and check `type_info`.
            
            // To simplify logic, we can try to cast everything to string in SQL or handle basic types here.
            // Let's attempt to get as String first, then standard types if failure?
            // Actually, Sqlite values can be cast to String easily.
            // But we want JSON numbers/bools if possible.
            
            // Hacky but robust: just get everything as String for the viewer?
            // "Viewer" usually expects strings for editing inputs.
            // Let's stick to ALL STRINGS for consistency with the Postgres implementation (row_to_json does strings for safety often).
            // Wait, standard `row_to_json` in Postgres preserves types (Sort of).
            // But our Frontend treats `pendingChanges` as strings.
            // Let's try to get as String (TEXT) from DB.
            
            // `row.try_get::<String, _>(col.ordinal())` might fail if it's an INT.
            // `row.try_get::<i64, _>(col.ordinal())` ...
            
            // Let's use `sqlx::ValueRef`.
            let raw_val = row.try_get_raw(col.ordinal()).unwrap();
            if raw_val.is_null() {
                map.insert(name.to_string(), serde_json::Value::Null);
            } else {
                let type_info = raw_val.type_info();
                let type_name = type_info.name();
                match type_name {
                    "INTEGER" => {
                        let v: i64 = row.get(col.ordinal());
                        map.insert(name.to_string(), serde_json::Value::Number(v.into()));
                    },
                    "REAL" => {
                        let v: f64 = row.get(col.ordinal());
                        map.insert(name.to_string(), serde_json::Value::from(v));
                    },
                    "BOOLEAN" => {
                        let v: bool = row.get(col.ordinal());
                        map.insert(name.to_string(), serde_json::Value::Bool(v));
                    }
                    _ => {
                        let v: String = row.get(col.ordinal());
                        map.insert(name.to_string(), serde_json::Value::String(v));
                    }
                }
            }
        }
        json_rows.push(serde_json::Value::Object(map).to_string());
    }

    Ok(json_rows)
}

#[tauri::command]
async fn sqlite_update_cell(state: State<'_, AppState>, table_name: String, pk_col: String, pk_val: String, col_name: String, new_val: String) -> Result<u64, String> {
    let pool = {
        let guard = state.sqlite_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    // SQLite is dynamic, but we can try to bind as string and let SQLite coerce, 
    // OR format the query carefully.
    // Parameter binding `?` works well.
    // WHERE clause needs to match PK.
    
    // Safety: table/col names must be escaped quotes.
    // `pk_val` is passed as string from frontend. We bind it as string.
    
    let q = format!("UPDATE \"{}\" SET \"{}\" = ? WHERE \"{}\" = ?", table_name, col_name, pk_col);
    
    let result = sqlx::query(&q)
        .bind(new_val) // Bind as string, SQLite attempts coercion
        .bind(pk_val)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.rows_affected())
}

#[tauri::command]
async fn sqlite_get_primary_key(state: State<'_, AppState>, table_name: String) -> Result<Option<String>, String> {
    let pool = {
        let guard = state.sqlite_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    
    // PRAGMA table_info(table_name)
    // returns columns: cid, name, type, notnull, dflt_value, pk
    let q = format!("PRAGMA table_info(\"{}\")", table_name);
    let rows = sqlx::query(&q)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    for row in rows {
        let pk: i32 = row.get("pk");
        if pk > 0 {
             let name: String = row.get("name");
             return Ok(Some(name));
        }
    }
    
    Ok(None)
}

#[tauri::command]
fn greet() -> String {
    let now = SystemTime::now();
    let epoch_ms = now.duration_since(UNIX_EPOCH).unwrap().as_millis();
    format!("Hello from Rust! Time: {}", epoch_ms)
}

#[tauri::command]
fn update_click_region(window: tauri::Window, width: f64, height: f64, _align_x: String, _align_y: String) {
    if let Ok(factor) = window.scale_factor() {
        let target_w = width * factor;
        let target_h = height * factor;
        
        // Resize the actual window instead of setting a region
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: target_w as u32,
            height: target_h as u32,
        }));
    }
}

#[tauri::command]
fn get_screen_work_area_for_webview(window: &tauri::WebviewWindow) -> (i32, i32, i32, i32) {
    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = window.hwnd() {
            unsafe {
                let hmonitor = MonitorFromWindow(HWND(hwnd.0 as _), MONITOR_DEFAULTTONEAREST);
                let mut mi = MONITORINFO {
                    cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                    ..Default::default()
                };
                if GetMonitorInfoW(hmonitor, &mut mi).as_bool() {
                    let r = mi.rcWork;
                    return (r.left, r.top, r.right - r.left, r.bottom - r.top);
                }
            }
        }
    }
    
    // Fallback
    if let Ok(Some(m)) = window.current_monitor() {
        let size = m.size();
        let pos = m.position();
        (pos.x, pos.y, size.width as i32, size.height as i32)
    } else {
        (0, 0, 800, 600)
    }
}

#[tauri::command]
fn get_screen_work_area(window: tauri::Window) -> (i32, i32, i32, i32) {
    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = window.hwnd() {
            unsafe {
                let hmonitor = MonitorFromWindow(HWND(hwnd.0 as _), MONITOR_DEFAULTTONEAREST);
                let mut mi = MONITORINFO {
                    cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                    ..Default::default()
                };
                if GetMonitorInfoW(hmonitor, &mut mi).as_bool() {
                    let r = mi.rcWork;
                    return (r.left, r.top, r.right - r.left, r.bottom - r.top);
                }
            }
        }
    }
    
    // Fallback
    if let Ok(Some(m)) = window.current_monitor() {
        let size = m.size();
        let pos = m.position();
        (pos.x, pos.y, size.width as i32, size.height as i32)
    } else {
        (0, 0, 800, 600)
    }
}

#[tauri::command]
fn get_all_monitors_work_area() -> Vec<(i32, i32, i32, i32)> {
    #[cfg(target_os = "windows")]
    {
        unsafe extern "system" fn monitor_enum_proc(
            hmonitor: windows::Win32::Graphics::Gdi::HMONITOR,
            _: HDC,
            _: *mut RECT,
            lparam: LPARAM,
        ) -> BOOL {
            let monitors = &mut *(lparam.0 as *mut Vec<(i32, i32, i32, i32)>);
            let mut mi = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if GetMonitorInfoW(hmonitor, &mut mi).as_bool() {
                let r = mi.rcWork;
                monitors.push((r.left, r.top, r.right - r.left, r.bottom - r.top));
            }
            BOOL(1)
        }

        let mut monitors = Vec::new();
        unsafe {
            let _ = EnumDisplayMonitors(
                None,
                None,
                Some(monitor_enum_proc),
                LPARAM(&mut monitors as *mut _ as isize),
            );
        }
        return monitors;
    }

    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

#[tauri::command]
async fn connect_redis(
    state: State<'_, AppState>,
    host: String,
    port: u16,
    password: Option<String>,
    timeout_sec: Option<u64>,
    sshConfig: Option<SshConfig>,
) -> Result<String, String> {
    let timeout_val = Duration::from_secs(timeout_sec.unwrap_or(5));
    
    let (final_host, final_port) = if let Some(ssh) = sshConfig {
        let (local_port, handle) = establish_ssh_tunnel(ssh, host.clone(), port).await?;
        state.ssh_sessions.lock().unwrap().insert("redis".to_string(), handle);
        ("127.0.0.1".to_string(), local_port)
    } else {
        (host, port)
    };

    let client = redis::Client::open(redis::ConnectionInfo {
        addr: redis::ConnectionAddr::Tcp(final_host, final_port),
        redis: redis::RedisConnectionInfo {
            db: 0,
            username: None,
            password: password,
            ..Default::default()
        },
    }).map_err(|e| e.to_string())?;

    // Use tokio timeout for connection
    let mut con = tokio::time::timeout(timeout_val, client.get_multiplexed_async_connection())
        .await
        .map_err(|_| "Connection timed out".to_string())?
        .map_err(|e| e.to_string())?;
    
    let _: () = redis::cmd("PING").query_async(&mut con).await.map_err(|e| e.to_string())?;
    
    *state.redis_client.lock().unwrap() = Some(client);
    Ok("Connected to Redis".to_string())
}

#[tauri::command]
async fn connect_mysql(
    state: State<'_, AppState>,
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    database: Option<String>,
    timeout_sec: Option<u64>,
    sshConfig: Option<SshConfig>, 
) -> Result<String, String> {
    use sqlx::mysql::MySqlConnectOptions;

    let timeout_val = Duration::from_secs(timeout_sec.unwrap_or(5));
    let db = database.unwrap_or_else(|| "mysql".to_string());

    let (final_host, final_port) = if let Some(ssh) = sshConfig {
        let (local_port, handle) = establish_ssh_tunnel(ssh, host.clone(), port).await?;
        state.ssh_sessions.lock().unwrap().insert("mysql".to_string(), handle);
        ("127.0.0.1".to_string(), local_port)
    } else {
        (host, port)
    };

    let mut options = MySqlConnectOptions::new()
        .host(&final_host)
        .port(final_port)
        .username(&username)
        .database(&db);

    if let Some(pwd) = password {
        if !pwd.is_empty() {
            options = options.password(&pwd);
        }
    }

    let pool = MySqlPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(timeout_val)
        .connect_with(options)
        .await
        .map_err(|e| e.to_string())?;

    *state.mysql_pool.lock().unwrap() = Some(pool);
    Ok("Connected to MySQL".to_string())
}

#[tauri::command]
async fn connect_postgres(
    state: State<'_, AppState>,
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    database: Option<String>,
    timeout_sec: Option<u64>,
    sshConfig: Option<SshConfig>,
) -> Result<String, String> {
    use sqlx::postgres::{PgConnectOptions, PgSslMode};

    let timeout_val = Duration::from_secs(timeout_sec.unwrap_or(5));
    let db = database.unwrap_or_else(|| "postgres".to_string());

    let (final_host, final_port) = if let Some(ssh) = sshConfig {
        let (local_port, handle) = establish_ssh_tunnel(ssh, host.clone(), port).await?;
        state.ssh_sessions.lock().unwrap().insert("postgres".to_string(), handle);
        ("127.0.0.1".to_string(), local_port)
    } else {
        (host, port)
    };

    let mut options = PgConnectOptions::new()
        .host(&final_host)
        .port(final_port)
        .username(&username)
        .database(&db)
        .ssl_mode(PgSslMode::Disable); // Disable SSL via tunnel to avoid hostname mismatch

    if let Some(pwd) = password {
        if !pwd.is_empty() {
            options = options.password(&pwd);
        }
    }

    // Attempt to connect
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(timeout_val)
        .connect_with(options)
        .await
        .map_err(|e| e.to_string())?;

    *state.pg_pool.lock().unwrap() = Some(pool);
    Ok("Connected to PostgreSQL".to_string())
}

#[tauri::command]
async fn connect_mongodb(
    state: State<'_, AppState>,
    host: String,
    port: u16,
    username: Option<String>,
    password: Option<String>,
    timeout_sec: Option<u64>,
    sshConfig: Option<SshConfig>,
) -> Result<String, String> {
    let timeout_val = Duration::from_secs(timeout_sec.unwrap_or(5));
    
    let (final_host, final_port) = if let Some(ssh) = sshConfig {
        let (local_port, handle) = establish_ssh_tunnel(ssh, host.clone(), port).await?;
        state.ssh_sessions.lock().unwrap().insert("mongodb".to_string(), handle);
        ("127.0.0.1".to_string(), local_port)
    } else {
        (host, port)
    };

    let mut client_options = ClientOptions::parse(format!("mongodb://{}:{}", final_host, final_port))
        .await
        .map_err(|e| e.to_string())?;

    client_options.connect_timeout = Some(timeout_val);
    client_options.server_selection_timeout = Some(timeout_val);

    if let (Some(u), Some(p)) = (username, password) {
         client_options.credential = Some(mongodb::options::Credential::builder()
            .username(u)
            .password(p)
            .build());
    }

    let client = Client::with_options(client_options).map_err(|e| e.to_string())?;

    // Ping the server
    client
        .list_database_names()
        .await
        .map_err(|e| e.to_string())?;

    *state.mongo_client.lock().unwrap() = Some(client);
    Ok("Connected to MongoDB".to_string())
}

#[tauri::command]
async fn redis_get_keys(state: State<'_, AppState>, pattern: String) -> Result<Vec<String>, String> {
    let client = {
        let guard = state.redis_client.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let mut con = client.get_multiplexed_async_connection().await.map_err(|e| e.to_string())?;
    let keys: Vec<String> = redis::cmd("KEYS").arg(pattern).query_async(&mut con).await.map_err(|e| e.to_string())?;
    Ok(keys)
}

#[tauri::command]
async fn redis_get_value(state: State<'_, AppState>, key: String) -> Result<String, String> {
    let client = {
        let guard = state.redis_client.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let mut con = client.get_multiplexed_async_connection().await.map_err(|e| e.to_string())?;

    let key_type: String = redis::cmd("TYPE").arg(&key).query_async(&mut con).await.map_err(|e| e.to_string())?;

    match key_type.as_str() {
        "string" => {
            let val: String = redis::cmd("GET").arg(&key).query_async(&mut con).await.map_err(|e| e.to_string())?;
            Ok(val)
        },
        "hash" => {
            // Return as JSON
            let val: std::collections::HashMap<String, String> = redis::cmd("HGETALL").arg(&key).query_async(&mut con).await.map_err(|e| e.to_string())?;
            serde_json::to_string(&val).map_err(|e| e.to_string())
        },
        "list" => {
             let val: Vec<String> = redis::cmd("LRANGE").arg(&key).arg(0).arg(-1).query_async(&mut con).await.map_err(|e| e.to_string())?;
             serde_json::to_string(&val).map_err(|e| e.to_string())
        },
        "set" => {
             let val: Vec<String> = redis::cmd("SMEMBERS").arg(&key).query_async(&mut con).await.map_err(|e| e.to_string())?;
             serde_json::to_string(&val).map_err(|e| e.to_string())
        },
        "zset" => {
             let val: Vec<String> = redis::cmd("ZRANGE").arg(&key).arg(0).arg(-1).query_async(&mut con).await.map_err(|e| e.to_string())?;
             serde_json::to_string(&val).map_err(|e| e.to_string())
        },
        _ => {
            Ok(format!("Unsupported type: {}", key_type))
        }
    }
}

#[tauri::command]
async fn redis_set_value(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    let client = {
        let guard = state.redis_client.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let mut con = client.get_multiplexed_async_connection().await.map_err(|e| e.to_string())?;
    
    let _: () = redis::cmd("SET").arg(key).arg(value).query_async(&mut con).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn redis_del_key(state: State<'_, AppState>, key: String) -> Result<(), String> {
    let client = {
        let guard = state.redis_client.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let mut con = client.get_multiplexed_async_connection().await.map_err(|e| e.to_string())?;
    let _: () = redis::cmd("DEL").arg(key).query_async(&mut con).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn redis_get_ttl(state: State<'_, AppState>, key: String) -> Result<i64, String> {
    let client = {
        let guard = state.redis_client.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let mut con = client.get_multiplexed_async_connection().await.map_err(|e| e.to_string())?;
    let ttl: i64 = redis::cmd("TTL").arg(key).query_async(&mut con).await.map_err(|e| e.to_string())?;
    Ok(ttl)
}

#[tauri::command]
async fn redis_execute_raw(state: State<'_, AppState>, command: String) -> Result<String, String> {
    let client = {
        let guard = state.redis_client.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let mut con = client.get_multiplexed_async_connection().await.map_err(|e| e.to_string())?;
    
    let parts: Vec<&str> = command.split_whitespace().collect();
    if parts.is_empty() {
        return Err("Empty command".to_string());
    }
    
    let mut cmd = redis::cmd(parts[0]);
    for arg in &parts[1..] {
        cmd.arg(*arg);
    }
    
    let val: redis::Value = cmd.query_async(&mut con).await.map_err(|e| e.to_string())?;
    
    fn format_redis_value(v: redis::Value) -> String {
        match v {
            redis::Value::Nil => "(nil)".to_string(),
            redis::Value::Int(i) => i.to_string(),
            redis::Value::BulkString(d) => String::from_utf8_lossy(&d).to_string(),
            redis::Value::Array(v) => {
                let items: Vec<String> = v.into_iter().map(format_redis_value).collect();
                format!("[{}]", items.join(", "))
            },
            redis::Value::SimpleString(s) => s,
            redis::Value::Okay => "OK".to_string(),
            _ => format!("{:?}", v),
        }
    }
    
    Ok(format_redis_value(val))
}

#[tauri::command]
async fn mysql_get_tables(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let rows = sqlx::query("SHOW TABLES")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut tables = Vec::new();
    for row in rows {
        // MySQL may return VARBINARY for table names in some configurations
        // Try to get as bytes first, then convert to string
        if let Ok(bytes) = row.try_get::<Vec<u8>, _>(0) {
            if let Ok(name) = String::from_utf8(bytes) {
                tables.push(name);
            }
        } else if let Ok(name) = row.try_get::<String, _>(0) {
            tables.push(name);
        }
    }

    Ok(tables)
}

#[tauri::command]
async fn mysql_get_rows(state: State<'_, AppState>, table_name: String, limit: i64, offset: i64) -> Result<Vec<String>, String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let q = format!("SELECT * FROM `{}` LIMIT {} OFFSET {}", table_name, limit, offset);
    
    let rows = sqlx::query(&q)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut json_rows = Vec::new();
    for row in rows {
        let mut map = serde_json::Map::new();
        for col in row.columns() {
            let name = col.name();
            // MySQL Types: Try to get as specific types or fallback to string
            let raw_val = row.try_get_raw(col.ordinal()).unwrap();
            
            if raw_val.is_null() {
                map.insert(name.to_string(), serde_json::Value::Null);
            } else {
                 let type_info = raw_val.type_info();
                 let type_name = type_info.name();
                 match type_name {
                     "TINYINT" | "SMALLINT" | "INT" | "BIGINT" => {
                         if let Ok(v) = row.try_get::<i64, _>(col.ordinal()) {
                            map.insert(name.to_string(), serde_json::Value::Number(v.into()));
                         } else if let Ok(bytes) = row.try_get::<Vec<u8>, _>(col.ordinal()) {
                            let v = String::from_utf8_lossy(&bytes).to_string();
                            map.insert(name.to_string(), serde_json::Value::String(v));
                         } else if let Ok(v) = row.try_get::<String, _>(col.ordinal()) {
                            map.insert(name.to_string(), serde_json::Value::String(v));
                         } else {
                            map.insert(name.to_string(), serde_json::Value::Null);
                         }
                     },
                     "FLOAT" | "DOUBLE" | "DECIMAL" => {
                         if let Ok(v) = row.try_get::<f64, _>(col.ordinal()) {
                             map.insert(name.to_string(), serde_json::Value::from(v));
                         } else if let Ok(bytes) = row.try_get::<Vec<u8>, _>(col.ordinal()) {
                             let v = String::from_utf8_lossy(&bytes).to_string();
                             map.insert(name.to_string(), serde_json::Value::String(v));
                         } else if let Ok(v) = row.try_get::<String, _>(col.ordinal()) {
                             map.insert(name.to_string(), serde_json::Value::String(v));
                         } else {
                             map.insert(name.to_string(), serde_json::Value::Null);
                         }
                     },
                     "BOOLEAN" => {
                         if let Ok(v) = row.try_get::<bool, _>(col.ordinal()) {
                             map.insert(name.to_string(), serde_json::Value::Bool(v));
                         } else {
                             map.insert(name.to_string(), serde_json::Value::Null);
                         }
                     },
                     "BINARY" | "VARBINARY" | "BLOB" | "TINYBLOB" | "MEDIUMBLOB" | "LONGBLOB" => {
                         if let Ok(bytes) = row.try_get::<Vec<u8>, _>(col.ordinal()) {
                             let v = String::from_utf8_lossy(&bytes).to_string();
                             map.insert(name.to_string(), serde_json::Value::String(v));
                         } else {
                             map.insert(name.to_string(), serde_json::Value::Null);
                         }
                     },
                     _ => {
                         // Try bytes first for potential VARBINARY, then string
                         if let Ok(bytes) = row.try_get::<Vec<u8>, _>(col.ordinal()) {
                             let v = String::from_utf8_lossy(&bytes).to_string();
                             map.insert(name.to_string(), serde_json::Value::String(v));
                         } else if let Ok(v) = row.try_get::<String, _>(col.ordinal()) {
                             map.insert(name.to_string(), serde_json::Value::String(v));
                         } else {
                             map.insert(name.to_string(), serde_json::Value::Null);
                         }
                     }
                 }
            }
        }
        json_rows.push(serde_json::Value::Object(map).to_string());
    }

    Ok(json_rows)
}

#[tauri::command]
async fn mysql_get_count(state: State<'_, AppState>, table_name: String) -> Result<i64, String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let q = format!("SELECT COUNT(*) FROM `{}`", table_name);
    
    let count: (i64,) = sqlx::query_as(&q)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(count.0)
}

#[tauri::command]
async fn mysql_get_primary_key(state: State<'_, AppState>, table_name: String) -> Result<Option<String>, String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let q = "SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' AND TABLE_SCHEMA = DATABASE() LIMIT 1";
    
    let row = sqlx::query(q)
        .bind(table_name)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(r) = row {
        if let Ok(bytes) = r.try_get::<Vec<u8>, _>(0) {
            return Ok(String::from_utf8(bytes).ok());
        } else if let Ok(name) = r.try_get::<String, _>(0) {
            return Ok(Some(name));
        }
    }
    Ok(None)
}

#[tauri::command]
async fn mysql_update_cell(state: State<'_, AppState>, table_name: String, pk_col: String, pk_val: String, col_name: String, new_val: String) -> Result<u64, String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let q = format!("UPDATE `{}` SET `{}` = ? WHERE `{}` = ?", table_name, col_name, pk_col);

    let result = sqlx::query(&q)
        .bind(new_val)
        .bind(pk_val)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.rows_affected())
}

#[tauri::command]
async fn mysql_get_databases(state: State<'_, AppState>) -> Result<Vec<(String, i64)>, String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    // Query information_schema for size. 
    // Uses LEFT JOIN to include empty databases (size as 0).
    // CAST to SIGNED is crucial for type safety.
    let query = "
        SELECT 
            CONVERT(s.schema_name USING utf8) as schema_name, 
            CAST(COALESCE(SUM(t.data_length + t.index_length), 0) AS SIGNED) as size
        FROM information_schema.schemata s
        LEFT JOIN information_schema.tables t ON s.schema_name = t.table_schema
        GROUP BY s.schema_name
        ORDER BY s.schema_name
    ";

    let rows: Vec<(String, i64)> = sqlx::query_as(query)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
async fn mysql_use_database(state: State<'_, AppState>, database: String) -> Result<(), String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    // USE command is not supported in prepared statement protocol
    // We need to use raw_sql instead
    let q = format!("USE `{}`", database);
    sqlx::raw_sql(&q)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// Get tables with size info for a specific database (doesn't change current database)
#[tauri::command]
async fn mysql_get_tables_with_size(state: State<'_, AppState>, database: String) -> Result<Vec<(String, i64)>, String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let query = format!(
        "SELECT CONVERT(TABLE_NAME USING utf8) as TABLE_NAME, CAST(COALESCE(DATA_LENGTH + INDEX_LENGTH, 0) AS SIGNED) as size \
         FROM information_schema.TABLES \
         WHERE TABLE_SCHEMA = '{}' \
         ORDER BY TABLE_NAME",
        database
    );
    
    let rows: Vec<(String, i64)> = sqlx::query_as(&query)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
async fn mysql_get_views(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let rows: Vec<(String,)> = sqlx::query_as("SHOW FULL TABLES WHERE Table_type = 'VIEW'")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(name,)| name).collect())
}

#[tauri::command]
async fn mysql_get_functions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let rows: Vec<(String,)> = sqlx::query_as("SELECT CONVERT(ROUTINE_NAME USING utf8) FROM information_schema.ROUTINES WHERE ROUTINE_TYPE = 'FUNCTION' AND ROUTINE_SCHEMA = DATABASE()")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(name,)| name).collect())
}

#[tauri::command]
async fn mysql_get_procedures(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let rows: Vec<(String,)> = sqlx::query_as("SELECT CONVERT(ROUTINE_NAME USING utf8) FROM information_schema.ROUTINES WHERE ROUTINE_TYPE = 'PROCEDURE' AND ROUTINE_SCHEMA = DATABASE()")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(name,)| name).collect())
}

#[tauri::command]
async fn postgres_get_databases(state: State<'_, AppState>) -> Result<Vec<(String, i64)>, String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let rows: Vec<(String, i64)> = sqlx::query_as("SELECT datname::text, pg_database_size(datname) as size FROM pg_database WHERE datistemplate = false AND has_database_privilege(datname, 'CONNECT') ORDER BY datname")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
async fn postgres_get_tables(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let rows: Vec<(String,)> = sqlx::query_as("SELECT table_name::text FROM information_schema.tables WHERE table_schema = 'public'")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(name,)| name).collect())
}

#[tauri::command]
async fn postgres_get_tables_with_size(state: State<'_, AppState>) -> Result<Vec<(String, i64)>, String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT table_name::text, pg_total_relation_size(quote_ident(table_name)) as size \
         FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
async fn postgres_get_views(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let rows: Vec<(String,)> = sqlx::query_as("SELECT table_name::text FROM information_schema.views WHERE table_schema = 'public'")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(name,)| name).collect())
}

#[tauri::command]
async fn postgres_get_functions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let rows: Vec<(String,)> = sqlx::query_as("SELECT routine_name::text FROM information_schema.routines WHERE routine_type = 'FUNCTION' AND routine_schema = 'public'")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(name,)| name).collect())
}

#[tauri::command]
async fn postgres_get_procedures(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let rows: Vec<(String,)> = sqlx::query_as("SELECT routine_name::text FROM information_schema.routines WHERE routine_type = 'PROCEDURE' AND routine_schema = 'public'")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(name,)| name).collect())
}

#[tauri::command]
async fn postgres_get_rows(state: State<'_, AppState>, table_name: String, limit: i64, offset: i64) -> Result<Vec<String>, String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    // Fetch PK for stable sorting
    let pk_q = "
        SELECT kcu.column_name::text
        FROM information_schema.key_column_usage kcu
        JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name
        WHERE kcu.table_schema = 'public'
        AND kcu.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY'
        LIMIT 1
    ";
    
    let pk_row: Option<(String,)> = sqlx::query_as(pk_q)
        .bind(&table_name)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

    let inner_q = if let Some((pk,)) = pk_row {
        format!("SELECT * FROM public.\"{}\" ORDER BY \"{}\" ASC LIMIT {} OFFSET {}", table_name, pk, limit, offset)
    } else {
        format!("SELECT * FROM public.\"{}\" LIMIT {} OFFSET {}", table_name, limit, offset)
    };

    let q = format!("SELECT row_to_json(t)::text FROM ({}) t", inner_q);
    
    let rows: Vec<(String,)> = sqlx::query_as(&q)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(json,)| json).collect())
}

#[tauri::command]
async fn postgres_get_count(state: State<'_, AppState>, table_name: String) -> Result<i64, String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let q = format!("SELECT COUNT(*) FROM public.\"{}\"", table_name);
    
    let count: (i64,) = sqlx::query_as(&q)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(count.0)
}


#[tauri::command]
async fn postgres_get_primary_key(state: State<'_, AppState>, table_name: String) -> Result<Option<String>, String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let q = "
        SELECT kcu.column_name::text
        FROM information_schema.key_column_usage kcu
        JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name
        WHERE kcu.table_schema = 'public'
        AND kcu.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY'
        LIMIT 1
    ";

    let row: Option<(String,)> = sqlx::query_as(q)
        .bind(table_name)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(row.map(|(r,)| r))
}

#[tauri::command]
async fn postgres_update_cell(state: State<'_, AppState>, table_name: String, pk_col: String, pk_val: String, col_name: String, new_val: String) -> Result<u64, String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    // 1. Get column type to cast the input string correctly
    let type_q = "SELECT udt_name::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2";
    let type_row: Option<(String,)> = sqlx::query_as(type_q)
        .bind(&table_name)
        .bind(&col_name)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;
    
    // Default to text if not found (shouldn't happen for valid columns)
    let col_type = type_row.map(|r| r.0).unwrap_or_else(|| "text".to_string());

    // 2. Update with explicit cast
    // We bind the new value as string ($1) and cast it to the target column type ($1::{col_type})
    // This allows updating numeric, boolean, uuid, etc. columns with string input.
    // We also cast PK to text ("{pk_col}"::text) to compare against stringified PK value.
    let q = format!("UPDATE public.\"{}\" SET \"{}\" = $1::{} WHERE \"{}\"::text = $2", table_name, col_name, col_type, pk_col);

    let result = sqlx::query(&q)
        .bind(new_val)
        .bind(pk_val)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.rows_affected())
}

#[tauri::command]
async fn sqlite_execute_raw(state: State<'_, AppState>, sql: String) -> Result<String, String> {
    let pool = {
        let guard = state.sqlite_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let is_query = sql.trim().to_uppercase().starts_with("SELECT") || sql.trim().to_uppercase().starts_with("PRAGMA") || sql.trim().to_uppercase().starts_with("EXPLAIN");

    if is_query {
        let rows = sqlx::query(&sql).fetch_all(&pool).await.map_err(|e| e.to_string())?;
        let mut json_rows = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            for col in row.columns() {
                let name = col.name();
                let raw_val = row.try_get_raw(col.ordinal()).unwrap();
                if raw_val.is_null() {
                    map.insert(name.to_string(), serde_json::Value::Null);
                } else {
                    let type_info = raw_val.type_info();
                    let type_name = type_info.name();
                    match type_name {
                        "INTEGER" => {
                            let v: i64 = row.get(col.ordinal());
                            map.insert(name.to_string(), serde_json::Value::Number(v.into()));
                        },
                        "REAL" => {
                            let v: f64 = row.get(col.ordinal());
                            map.insert(name.to_string(), serde_json::Value::from(v));
                        },
                        "BOOLEAN" => {
                            let v: bool = row.get(col.ordinal());
                            map.insert(name.to_string(), serde_json::Value::Bool(v));
                        }
                        _ => {
                            let v: String = row.get(col.ordinal());
                            map.insert(name.to_string(), serde_json::Value::String(v));
                        }
                    }
                }
            }
            json_rows.push(serde_json::Value::Object(map));
        }
        Ok(serde_json::to_string(&json_rows).unwrap())
    } else {
        let result = sqlx::query(&sql).execute(&pool).await.map_err(|e| e.to_string())?;
        Ok(format!("Success: {} rows affected", result.rows_affected()))
    }
}

#[tauri::command]
async fn mysql_execute_raw(state: State<'_, AppState>, sql: String) -> Result<String, String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let is_query = sql.trim().to_uppercase().starts_with("SELECT") || sql.trim().to_uppercase().starts_with("SHOW") || sql.trim().to_uppercase().starts_with("DESCRIBE") || sql.trim().to_uppercase().starts_with("EXPLAIN");

    if is_query {
        let rows = sqlx::query(&sql).fetch_all(&pool).await.map_err(|e| e.to_string())?;
        let mut json_rows = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            for col in row.columns() {
                let name = col.name();
                let raw_val = row.try_get_raw(col.ordinal()).unwrap();
                if raw_val.is_null() {
                    map.insert(name.to_string(), serde_json::Value::Null);
                } else {
                     let type_info = raw_val.type_info();
                     let type_name = type_info.name();
                     match type_name {
                         "TINYINT" | "SMALLINT" | "INT" | "BIGINT" => {
                             if let Ok(v) = row.try_get::<i64, _>(col.ordinal()) {
                                map.insert(name.to_string(), serde_json::Value::Number(v.into()));
                             } else {
                                let v: String = row.get(col.ordinal());
                                map.insert(name.to_string(), serde_json::Value::String(v));
                             }
                         },
                         "FLOAT" | "DOUBLE" | "DECIMAL" => {
                             if let Ok(v) = row.try_get::<f64, _>(col.ordinal()) {
                                 map.insert(name.to_string(), serde_json::Value::from(v));
                             } else {
                                 let v: String = row.get(col.ordinal());
                                 map.insert(name.to_string(), serde_json::Value::String(v));
                             }
                         },
                         "BOOLEAN" => {
                             if let Ok(v) = row.try_get::<bool, _>(col.ordinal()) {
                                 map.insert(name.to_string(), serde_json::Value::Bool(v));
                             } else {
                                 let v: String = row.get(col.ordinal());
                                 map.insert(name.to_string(), serde_json::Value::String(v));
                             }
                         },
                         _ => {
                             let v: String = row.get(col.ordinal());
                             map.insert(name.to_string(), serde_json::Value::String(v));
                         }
                     }
                }
            }
            json_rows.push(serde_json::Value::Object(map));
        }
        Ok(serde_json::to_string(&json_rows).unwrap())
    } else {
        let result = sqlx::query(&sql).execute(&pool).await.map_err(|e| e.to_string())?;
        Ok(format!("Success: {} rows affected", result.rows_affected()))
    }
}

#[tauri::command]
async fn postgres_execute_raw(state: State<'_, AppState>, sql: String) -> Result<String, String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let is_query = sql.trim().to_uppercase().starts_with("SELECT") || sql.trim().to_uppercase().starts_with("SHOW") || sql.trim().to_uppercase().starts_with("EXPLAIN");

    if is_query {
        // For Postgres, row_to_json is often easier but let's do manual for consistency and because we don't have a wrapper query here
        let rows = sqlx::query(&sql).fetch_all(&pool).await.map_err(|e| e.to_string())?;
        let mut json_rows = Vec::new();
        for row in rows {
            let mut map = serde_json::Map::new();
            for col in row.columns() {
                let name = col.name();
                let raw_val = row.try_get_raw(col.ordinal()).unwrap();
                if raw_val.is_null() {
                    map.insert(name.to_string(), serde_json::Value::Null);
                } else {
                    let type_info = raw_val.type_info();
                    let type_name = type_info.name();
                    match type_name {
                        "INT2" | "INT4" | "INT8" => {
                            if let Ok(v) = row.try_get::<i64, _>(col.ordinal()) {
                                map.insert(name.to_string(), serde_json::Value::Number(v.into()));
                            } else {
                                let v: String = row.get(col.ordinal());
                                map.insert(name.to_string(), serde_json::Value::String(v));
                            }
                        },
                        "FLOAT4" | "FLOAT8" | "NUMERIC" => {
                            if let Ok(v) = row.try_get::<f64, _>(col.ordinal()) {
                                map.insert(name.to_string(), serde_json::Value::from(v));
                            } else {
                                let v: String = row.get(col.ordinal());
                                map.insert(name.to_string(), serde_json::Value::String(v));
                            }
                        },
                        "BOOL" => {
                            if let Ok(v) = row.try_get::<bool, _>(col.ordinal()) {
                                map.insert(name.to_string(), serde_json::Value::Bool(v));
                            } else {
                                let v: String = row.get(col.ordinal());
                                map.insert(name.to_string(), serde_json::Value::String(v));
                            }
                        },
                        _ => {
                            let v: String = row.get(col.ordinal());
                            map.insert(name.to_string(), serde_json::Value::String(v));
                        }
                    }
                }
            }
            json_rows.push(serde_json::Value::Object(map));
        }
        Ok(serde_json::to_string(&json_rows).unwrap())
    } else {
        let result = sqlx::query(&sql).execute(&pool).await.map_err(|e| e.to_string())?;
        Ok(format!("Success: {} rows affected", result.rows_affected()))
    }
}

#[tauri::command]
async fn mysql_get_columns(state: State<'_, AppState>, table_name: String) -> Result<Vec<String>, String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let q = "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION";
    
    let rows = sqlx::query(q)
        .bind(table_name)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut columns = Vec::new();
    for row in rows {
        if let Ok(bytes) = row.try_get::<Vec<u8>, _>(0) {
            if let Ok(name) = String::from_utf8(bytes) {
                columns.push(name);
            }
        } else if let Ok(name) = row.try_get::<String, _>(0) {
            columns.push(name);
        }
    }

    Ok(columns)
}

#[tauri::command]
async fn postgres_get_columns(state: State<'_, AppState>, table_name: String) -> Result<Vec<String>, String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let q = "SELECT column_name::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position";
    
    let rows: Vec<(String,)> = sqlx::query_as(q)
        .bind(table_name)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(name,)| name).collect())
}

#[tauri::command]
async fn sqlite_get_columns(state: State<'_, AppState>, table_name: String) -> Result<Vec<String>, String> {
    let pool = {
        let guard = state.sqlite_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let q = format!("PRAGMA table_info(\"{}\")", table_name);
    
    let rows: Vec<(i32, String, String, i32, Option<String>, i32)> = sqlx::query_as(&q)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(_, name, _, _, _, _)| name).collect())
}

#[tauri::command]
async fn mysql_insert_row(state: State<'_, AppState>, table_name: String, data: serde_json::Map<String, serde_json::Value>) -> Result<u64, String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let cols: Vec<String> = data.keys().map(|k| format!("`{}`", k)).collect();
    let placeholders: Vec<String> = vec!["?".to_string(); data.len()];
    
    let q = format!("INSERT INTO `{}` ({}) VALUES ({})", table_name, cols.join(", "), placeholders.join(", "));
    
    let mut query = sqlx::query(&q);
    for val in data.values() {
        if val.is_null() {
            query = query.bind(Option::<String>::None);
        } else {
            let s = val.as_str().map(|s| s.to_string()).unwrap_or_else(|| val.to_string());
            query = query.bind(s);
        }
    }

    let result = query.execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(result.rows_affected())
}

#[tauri::command]
async fn postgres_insert_row(state: State<'_, AppState>, table_name: String, data: serde_json::Map<String, serde_json::Value>) -> Result<u64, String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    // 1. Fetch types for all columns being inserted to ensure correct casting
    let type_q = "SELECT column_name::text, udt_name::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1";
    let rows: Vec<(String, String)> = sqlx::query_as(type_q)
        .bind(&table_name)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
    
    let type_map: std::collections::HashMap<String, String> = rows.into_iter().collect();

    let mut cols_names = Vec::new();
    let mut placeholders = Vec::new();
    let mut bind_values = Vec::new();

    for (i, (k, v)) in data.iter().enumerate() {
        cols_names.push(format!("\"{}\"", k));
        
        // Get the column type for casting
        let col_type = type_map.get(k).map(|s| s.as_str()).unwrap_or("text");
        placeholders.push(format!("${}::{}", i + 1, col_type));
        
        // Convert value to string for binding (Postgres will cast via the placeholder)
        let val_str = match v {
            serde_json::Value::String(s) => s.clone(),
            serde_json::Value::Null => "".to_string(), // Handle null as empty string if bound to a cast? 
                                                      // Actually, if it's null, we might want to bind None.
            _ => v.to_string()
        };
        bind_values.push((val_str, v.is_null()));
    }
    
    let q = format!("INSERT INTO public.\"{}\" ({}) VALUES ({})", table_name, cols_names.join(", "), placeholders.join(", "));
    
    let mut query = sqlx::query(&q);
    for (v, is_null) in bind_values {
        if is_null {
            query = query.bind(Option::<String>::None);
        } else {
            query = query.bind(v);
        }
    }

    let result = query.execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(result.rows_affected())
}

#[tauri::command]
async fn sqlite_get_count(state: State<'_, AppState>, table_name: String) -> Result<i64, String> {
    let pool = {
        let guard = state.sqlite_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let q = format!("SELECT COUNT(*) FROM \"{}\"", table_name);
    let count: (i64,) = sqlx::query_as(&q).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    Ok(count.0)
}

#[tauri::command]
async fn sqlite_insert_row(state: State<'_, AppState>, table_name: String, data: serde_json::Map<String, serde_json::Value>) -> Result<u64, String> {
    let pool = {
        let guard = state.sqlite_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };

    let cols: Vec<String> = data.keys().map(|k| format!("\"{}\"", k)).collect();
    let placeholders: Vec<String> = vec!["?".to_string(); data.len()];
    
    let q = format!("INSERT INTO \"{}\" ({}) VALUES ({})", table_name, cols.join(", "), placeholders.join(", "));
    
    let mut query = sqlx::query(&q);
    for val in data.values() {
        if val.is_null() {
            query = query.bind(Option::<String>::None);
        } else {
            let s = val.as_str().map(|s| s.to_string()).unwrap_or_else(|| val.to_string());
            query = query.bind(s);
        }
    }

    let result = query.execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(result.rows_affected())
}

#[tauri::command]
async fn mysql_delete_row(state: State<'_, AppState>, table_name: String, pk_col: String, pk_val: String) -> Result<u64, String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let q = format!("DELETE FROM `{}` WHERE `{}` = ?", table_name, pk_col);
    let result = sqlx::query(&q).bind(pk_val).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(result.rows_affected())
}

#[tauri::command]
async fn mysql_drop_table(state: State<'_, AppState>, table_name: String) -> Result<(), String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let q = format!("DROP TABLE `{}`", table_name);
    sqlx::query(&q).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn postgres_delete_row(state: State<'_, AppState>, table_name: String, pk_col: String, pk_val: String) -> Result<u64, String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let q = format!("DELETE FROM public.\"{}\" WHERE \"{}\"::text = $1", table_name, pk_col);
    let result = sqlx::query(&q).bind(pk_val).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(result.rows_affected())
}

#[tauri::command]
async fn postgres_drop_table(state: State<'_, AppState>, table_name: String) -> Result<(), String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let q = format!("DROP TABLE public.\"{}\"", table_name);
    sqlx::query(&q).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn sqlite_delete_row(state: State<'_, AppState>, table_name: String, pk_col: String, pk_val: String) -> Result<u64, String> {
    let pool = {
        let guard = state.sqlite_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let q = format!("DELETE FROM \"{}\" WHERE \"{}\" = ?", table_name, pk_col);
    let result = sqlx::query(&q).bind(pk_val).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(result.rows_affected())
}

#[tauri::command]
async fn sqlite_drop_table(state: State<'_, AppState>, table_name: String) -> Result<(), String> {
    let pool = {
        let guard = state.sqlite_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let q = format!("DROP TABLE \"{}\"", table_name);
    sqlx::query(&q).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
async fn redis_rename_key(state: State<'_, AppState>, old_key: String, new_key: String) -> Result<(), String> {
    let client = {
        let guard = state.redis_client.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let mut con = client.get_multiplexed_async_connection().await.map_err(|e| e.to_string())?;
    let _: () = redis::cmd("RENAME").arg(old_key).arg(new_key).query_async(&mut con).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn mysql_rename_table(state: State<'_, AppState>, old_name: String, new_name: String) -> Result<(), String> {
    let pool = {
        let guard = state.mysql_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let q = format!("RENAME TABLE `{}` TO `{}`", old_name, new_name);
    sqlx::query(&q).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn postgres_rename_table(state: State<'_, AppState>, old_name: String, new_name: String) -> Result<(), String> {
    let pool = {
        let guard = state.pg_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let q = format!("ALTER TABLE public.\"{}\" RENAME TO \"{}\"", old_name, new_name);
    sqlx::query(&q).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn sqlite_rename_table(state: State<'_, AppState>, old_name: String, new_name: String) -> Result<(), String> {
    let pool = {
        let guard = state.sqlite_pool.lock().unwrap();
        guard.clone().ok_or("Not connected")?
    };
    let q = format!("ALTER TABLE \"{}\" RENAME TO \"{}\"", old_name, new_name);
    sqlx::query(&q).execute(&pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .manage(AppState {
        redis_client: Mutex::new(None),
        mysql_pool: Mutex::new(None),
        pg_pool: Mutex::new(None),
        sqlite_pool: Mutex::new(None),
        mongo_client: Mutex::new(None),
        ssh_sessions: Mutex::new(HashMap::new()),
    })
    .invoke_handler(tauri::generate_handler![
        greet,
        update_click_region,
        get_screen_work_area,
        get_all_monitors_work_area,
        connect_redis, 
        redis_get_keys,
        redis_get_value,
        redis_set_value,
        redis_del_key,
        redis_get_ttl,
        redis_execute_raw,
        connect_mysql,
        connect_postgres,
        connect_mongodb,
        connect_sqlite,
        mysql_get_tables,
        mysql_get_rows,
        mysql_get_count,
        mysql_get_primary_key,
        mysql_update_cell,
        postgres_get_tables,
        postgres_get_rows,
        postgres_get_count,
        postgres_get_primary_key,
        postgres_update_cell,
        sqlite_get_tables,
        sqlite_get_rows,
        sqlite_get_count,
        sqlite_update_cell,
        sqlite_get_primary_key,
        sqlite_execute_raw,
        mysql_execute_raw,
        postgres_execute_raw,
        mysql_get_columns,
        postgres_get_columns,
        sqlite_get_columns,
        mysql_insert_row,
        postgres_insert_row,
        sqlite_insert_row,
        mysql_delete_row,
        mysql_drop_table,
        postgres_delete_row,
        postgres_drop_table,
        sqlite_delete_row,
        sqlite_drop_table,
        redis_rename_key,
        mysql_rename_table,
        postgres_rename_table,
        sqlite_rename_table,
        mysql_get_databases,
        mysql_use_database,
        mysql_get_tables_with_size,
        mysql_get_views,
        mysql_get_functions,
        mysql_get_procedures,
        postgres_get_databases,
        postgres_get_tables_with_size,
        postgres_get_views,
        postgres_get_functions,
        postgres_get_procedures
    ])
    .setup(|app| {
        let window = app.get_webview_window("main").unwrap();

        // Initialize window size and position for floating widget
        // Set to toolbar size (365x56) and position at bottom-right corner
        let toolbar_width: u32 = 365;
        let toolbar_height: u32 = 56;
        let margin: i32 = 20; // Margin from screen edge
        
        // Get work area (excluding taskbar) 
        let work_area = get_screen_work_area_for_webview(&window);
        let (wa_x, wa_y, wa_w, wa_h) = work_area;
        
        // Calculate position for bottom-right corner of work area
        let x = wa_x + wa_w - toolbar_width as i32 - margin;
        let y = wa_y + wa_h - toolbar_height as i32 - margin;
        
        // Set initial size and position
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: toolbar_width,
            height: toolbar_height,
        }));
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));

        #[cfg(target_os = "windows")]
        {
            let hwnd_handle = window.hwnd().unwrap();
            let hwnd = HWND(hwnd_handle.0 as _);
            let dark_mode = 1i32;
            
            unsafe {
                let _ = DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_USE_IMMERSIVE_DARK_MODE,
                    &dark_mode as *const _ as *const _,
                    std::mem::size_of::<i32>() as u32,
                );
            }

            // 额外尝试设置 Webview 的背景色为透明
            let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
        }
        
        let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
        let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&show, &quit])?;

        // 显式嵌入图标字节，确保开发和生产环境都能正确加载最新的品牌 Logo
        let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))?;

        let _tray = TrayIconBuilder::new()
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| {
                match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                }
            })
            .on_tray_icon_event(|tray, event| {
                if let tauri::tray::TrayIconEvent::Click {
                    button: tauri::tray::MouseButton::Left,
                    ..
                } = event
                {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                         let _ = window.show();
                         let _ = window.set_focus();
                    }
                }
            })
            .icon(tray_icon)
            .build(app)?;

        window.show().unwrap();
        #[cfg(debug_assertions)]
        window.open_devtools();

        Ok(())
    })
    .on_window_event(|window, event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            if window.label() == "main" {
                let _ = window.hide();
                api.prevent_close();
            }
        }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
