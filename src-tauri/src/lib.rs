#![allow(unsafe_code)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, State,
};
use tauri::PhysicalPosition;
use std::time::{SystemTime, UNIX_EPOCH};
use std::sync::Mutex;

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::HWND;
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE};
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Gdi::{MonitorFromWindow, GetMonitorInfoW, MONITORINFO, MONITOR_DEFAULTTONEAREST, CreateRectRgn, SetWindowRgn}; // Added imports

use std::time::Duration;
use sqlx::{mysql::MySqlPoolOptions, postgres::PgPoolOptions, MySqlPool, PgPool};
use mongodb::{options::ClientOptions, Client};

struct AppState {
    redis_client: Mutex<Option<redis::Client>>,
    mysql_pool: Mutex<Option<MySqlPool>>,
    pg_pool: Mutex<Option<PgPool>>,
    mongo_client: Mutex<Option<Client>>,
}

#[tauri::command]
fn greet() -> String {
    let now = SystemTime::now();
    let epoch_ms = now.duration_since(UNIX_EPOCH).unwrap().as_millis();
    format!("Hello from Rust! Time: {}", epoch_ms)
}

#[tauri::command]
fn update_click_region(window: tauri::Window, width: f64, height: f64, align_x: String, align_y: String) {
    #[cfg(target_os = "windows")]
    {
        if let Ok(factor) = window.scale_factor() {
            if let Ok(size) = window.inner_size() {
                let max_w = size.width as f64;
                let max_h = size.height as f64;
                
                let target_w = width * factor;
                let target_h = height * factor;
                
                let rgn_x = if align_x == "end" { (max_w - target_w) as i32 } else { 0 };
                let rgn_y = if align_y == "end" { (max_h - target_h) as i32 } else { 0 };
                
                // Ensure dimensions are positive
                let rgn_w = (target_w as i32).max(1);
                let rgn_h = (target_h as i32).max(1);
                
                // Adjustment for correct region right/bottom coordinates
                let rgn_right = rgn_x + rgn_w;
                let rgn_bottom = rgn_y + rgn_h;

                unsafe {
                    let region = CreateRectRgn(rgn_x, rgn_y, rgn_right, rgn_bottom);
                    if let Ok(hwnd) = window.hwnd() {
                         let _ = SetWindowRgn(HWND(hwnd.0 as _), Some(region), true);
                    }
                }
            }
        }
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
async fn connect_redis(
    state: State<'_, AppState>,
    host: String,
    port: u16,
    password: Option<String>,
    timeout_sec: Option<u64>,
) -> Result<String, String> {
    let timeout_val = Duration::from_secs(timeout_sec.unwrap_or(5));
    let url = if let Some(pwd) = password {
        if !pwd.is_empty() {
            format!("redis://:{}@{}:{}/", pwd, host, port)
        } else {
            format!("redis://{}:{}/", host, port)
        }
    } else {
        format!("redis://{}:{}/", host, port)
    };

    let client = redis::Client::open(url).map_err(|e| e.to_string())?;
    
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
) -> Result<String, String> {
    let timeout_val = Duration::from_secs(timeout_sec.unwrap_or(5));
    let db = database.unwrap_or_else(|| "mysql".to_string()); // Default to mysql db to test connection
    let url = format!(
        "mysql://{}:{}@{}:{}/{}",
        username,
        password.unwrap_or_default(),
        host,
        port,
        db
    );

    let pool = MySqlPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(timeout_val)
        .connect(&url)
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
) -> Result<String, String> {
    let timeout_val = Duration::from_secs(timeout_sec.unwrap_or(5));
    let db = database.unwrap_or_else(|| "postgres".to_string());
    let url = format!(
        "postgres://{}:{}@{}:{}/{}",
        username,
        password.unwrap_or_default(),
        host,
        port,
        db
    );

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(timeout_val)
        .connect(&url)
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
) -> Result<String, String> {
    let timeout_val = Duration::from_secs(timeout_sec.unwrap_or(5));
    let mut client_options = ClientOptions::parse(format!("mongodb://{}:{}", host, port))
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .manage(AppState {
        redis_client: Mutex::new(None),
        mysql_pool: Mutex::new(None),
        pg_pool: Mutex::new(None),
        mongo_client: Mutex::new(None),
    })
    .invoke_handler(tauri::generate_handler![
        greet,
        update_click_region,
        get_screen_work_area,
        connect_redis, 
        connect_mysql,
        connect_postgres,
        connect_mongodb,
        postgres_get_tables,
        postgres_get_rows,
        postgres_get_count,
        postgres_get_primary_key,
        postgres_update_cell,
        redis_get_keys, 
        redis_get_value, 
        redis_set_value,
        redis_del_key
    ])
    .setup(|app| {
        let window = app.get_webview_window("main").unwrap();

        if let Ok(Some(_monitor)) = window.current_monitor() {
            // 获取工作区信息（排除任务栏）
            #[cfg(target_os = "windows")]
            let (wa_left, wa_top, wa_width, wa_height) = {
                
                let mut rect = (0, 0, 800, 600);
                if let Ok(hwnd) = window.hwnd() {
                    unsafe {
                        let hmonitor = MonitorFromWindow(HWND(hwnd.0 as _), MONITOR_DEFAULTTONEAREST);
                        let mut mi = MONITORINFO {
                            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                            ..Default::default()
                        };
                        if GetMonitorInfoW(hmonitor, &mut mi).as_bool() {
                            let r = mi.rcWork;
                            rect = (r.left, r.top, r.right - r.left, r.bottom - r.top);
                        }
                    }
                }
                rect
            };

            #[cfg(not(target_os = "windows"))]
            let (wa_left, wa_top, wa_width, wa_height) = {
                let size = _monitor.size();
                let pos = _monitor.position();
                (pos.x, pos.y, size.width as i32, size.height as i32)
            };
            
            // 设定最大物理尺寸
            let max_width = 1200.0; 
            let max_height = 800.0;
            
            let factor = window.scale_factor().unwrap();
            let p_width = max_width * factor;
            let p_height = max_height * factor;

            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { 
                width: p_width as u32, 
                height: p_height as u32 
            }));

            // Calculate position to be at bottom-right of WORK AREA with padding
            let x = wa_left + wa_width - p_width as i32 - 20;
            let y = wa_top + wa_height - p_height as i32 - 20;
            
            let _ = window.set_position(tauri::Position::Physical(PhysicalPosition { x, y }));
        }

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
        }
        
        let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
        let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&show, &quit])?;

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
            .icon(app.default_window_icon().unwrap().clone())
            .build(app)?;

        window.show().unwrap();
        window.open_devtools();
        Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
