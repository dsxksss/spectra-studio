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

struct AppState {
    redis_client: Mutex<Option<redis::Client>>,
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
) -> Result<String, String> {
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
    let mut con = client.get_multiplexed_async_connection().await.map_err(|e| e.to_string())?;
    
    let _: () = redis::cmd("PING").query_async(&mut con).await.map_err(|e| e.to_string())?;
    
    *state.redis_client.lock().unwrap() = Some(client);
    Ok("Connected".to_string())
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


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .manage(AppState {
        redis_client: Mutex::new(None),
    })
    .invoke_handler(tauri::generate_handler![
        greet, 
        update_click_region, 
        get_screen_work_area, 
        connect_redis, 
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
        Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
