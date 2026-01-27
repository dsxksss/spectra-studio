#![allow(unsafe_code)]

use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, PhysicalPosition};

#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE};

#[tauri::command]
fn greet() -> String {
  let now = SystemTime::now();
  let epoch_ms = now.duration_since(UNIX_EPOCH).unwrap().as_millis();
  format!("Hello world from Rust! Current epoch: {epoch_ms}")
}

#[tauri::command]
fn update_click_region(window: tauri::Window, width: f64, height: f64) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Gdi::{CreateRectRgn, SetWindowRgn};
        
        if let (Ok(factor), Ok(win_size)) = (window.scale_factor(), window.inner_size()) {
            let target_w = (width * factor).round() as i32;
            let target_h = (height * factor).round() as i32;
            
            let max_w = win_size.width as i32;
            let max_h = win_size.height as i32;

            let rgn_x = max_w - target_w;
            let rgn_y = max_h - target_h;

            unsafe {
                let region = CreateRectRgn(rgn_x, rgn_y, max_w, max_h);
                if let Ok(hwnd) = window.hwnd() {
                    // 修复：这里使用 Some(region)
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
    .invoke_handler(tauri::generate_handler![greet, update_click_region, get_screen_work_area])
    .setup(|app| {
        let window = app.get_webview_window("main").unwrap();

        if let Ok(Some(monitor)) = window.current_monitor() {
            let screen_size = monitor.size();
            
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

            let x = screen_size.width as i32 - p_width as i32 - 20;
            let y = screen_size.height as i32 - p_height as i32 - 20;
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
        
        window.show().unwrap();
        Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}