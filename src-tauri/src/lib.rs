#![allow(unsafe_code)]

use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, PhysicalPosition, State};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use std::sync::Mutex;

struct AppState {
    redis_client: Mutex<Option<redis::Client>>,
}

#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE};

#[tauri::command]
async fn connect_redis(
    state: State<'_, AppState>,
    host: String,
    port: u16,
    password: Option<String>,
) -> Result<String, String> {
    let url = if let Some(pwd) = password {
        if pwd.is_empty() {
            format!("redis://{}:{}/", host, port)
        } else {
            format!("redis://:{}@{}:{}/", pwd, host, port)
        }
    } else {
        format!("redis://{}:{}/", host, port)
    };

    let client = redis::Client::open(url).map_err(|e| e.to_string())?;
    
    // Verify connection
    let mut con = client.get_multiplexed_async_connection().await.map_err(|e| e.to_string())?;
    
    // Check if alive
    let _: () = redis::cmd("PING").query_async(&mut con).await.map_err(|e| e.to_string())?;

    *state.redis_client.lock().unwrap() = Some(client);
    
    Ok(format!("Connected to {}:{}", host, port))
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
        "list" => {
            let val: Vec<String> = redis::cmd("LRANGE").arg(&key).arg(0).arg(-1).query_async(&mut con).await.map_err(|e| e.to_string())?;
            Ok(serde_json::to_string(&val).map_err(|e| e.to_string())?)
        },
         "set" => {
            let val: Vec<String> = redis::cmd("SMEMBERS").arg(&key).query_async(&mut con).await.map_err(|e| e.to_string())?;
            Ok(serde_json::to_string(&val).map_err(|e| e.to_string())?)
        },
        "hash" => {
             let val: std::collections::HashMap<String, String> = redis::cmd("HGETALL").arg(&key).query_async(&mut con).await.map_err(|e| e.to_string())?;
             Ok(serde_json::to_string(&val).map_err(|e| e.to_string())?)
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
fn greet() -> String {
  let now = SystemTime::now();
  let epoch_ms = now.duration_since(UNIX_EPOCH).unwrap().as_millis();
  format!("Hello world from Rust! Current epoch: {epoch_ms}")
}

#[tauri::command]
fn update_click_region(window: tauri::Window, width: f64, height: f64, align_x: Option<String>, align_y: Option<String>) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Gdi::{CreateRectRgn, SetWindowRgn};
        
        if let (Ok(factor), Ok(win_size)) = (window.scale_factor(), window.inner_size()) {
            let target_w = (width * factor).round() as i32;
            let target_h = (height * factor).round() as i32;
            
            let max_w = win_size.width as i32;
            let max_h = win_size.height as i32;

            let x_align = align_x.as_deref().unwrap_or("end");
            let y_align = align_y.as_deref().unwrap_or("end");

            let rgn_x = if x_align == "start" {
                0
            } else {
                max_w - target_w
            };

            let rgn_y = if y_align == "start" {
                0
            } else {
                max_h - target_h
            };

            unsafe {
                let region = CreateRectRgn(rgn_x, rgn_y, rgn_x + target_w, rgn_y + target_h);
                if let Ok(hwnd) = window.hwnd() {
                    let _ = SetWindowRgn(HWND(hwnd.0 as _), Some(region), true);
                }
            }
        }
    }
}

#[tauri::command]
fn get_screen_work_area(window: tauri::Window) -> (i32, i32, i32, i32) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Gdi::{MonitorFromWindow, GetMonitorInfoW, MONITORINFO, MONITOR_DEFAULTTONEAREST};
        
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .manage(AppState {
        redis_client: Mutex::new(None),
    })
    .invoke_handler(tauri::generate_handler![greet, update_click_region, get_screen_work_area, connect_redis, redis_get_keys, redis_get_value, redis_set_value, redis_del_key])
    .setup(|app| {
        let window = app.get_webview_window("main").unwrap();

        if let Ok(Some(_monitor)) = window.current_monitor() {
            // 获取工作区信息（排除任务栏）
            #[cfg(target_os = "windows")]
            let (wa_left, wa_top, wa_width, wa_height) = {
                use windows::Win32::Foundation::HWND;
                use windows::Win32::Graphics::Gdi::{MonitorFromWindow, GetMonitorInfoW, MONITORINFO, MONITOR_DEFAULTTONEAREST};
                
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
            // Position = WorkArea Left + WorkArea Width - Window Width - Padding
            let x = wa_left + wa_width - p_width as i32 - 20;
            let y = wa_top + wa_height - p_height as i32 - 20;
            
            let _ = window.set_position(tauri::Position::Physical(PhysicalPosition { x, y }));
        }

        #[cfg(target_os = "windows")]
        {
            let hwnd_handle = window.hwnd().unwrap();
            let hwnd = windows::Win32::Foundation::HWND(hwnd_handle.0 as _);
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
        
        // Initialize System Tray
        
        // Better construction using Menu::new if available, or just constructing items directly
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
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
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