// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
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
fn resize_window(window: tauri::Window, width: f64, height: f64, x: f64, y: f64) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOZORDER, SWP_NOACTIVATE};
        
        if let Ok(hwnd) = window.hwnd() {
             let factor = window.scale_factor().unwrap_or(1.0);
             let p_x = (x * factor) as i32;
             let p_y = (y * factor) as i32;
             let p_w = (width * factor) as i32;
             let p_h = (height * factor) as i32;
             
             #[allow(unsafe_code)]
             unsafe {
                 let _ = SetWindowPos(HWND(hwnd.0 as _), None, p_x, p_y, p_w, p_h, SWP_NOZORDER | SWP_NOACTIVATE);
             }
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));
        let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![greet, resize_window])
    .setup(|app| {
        let window = app.get_webview_window("main").unwrap();

        // Initial positioning: Bottom Right
        if let Ok(Some(monitor)) = window.current_monitor() {
            let screen_size = monitor.size();
            let window_size = window.outer_size().unwrap();
            
            let x = screen_size.width as i32 - window_size.width as i32 - 20;
            let y = screen_size.height as i32 - window_size.height as i32 - 20;
            
            let _ = window.set_position(tauri::Position::Physical(PhysicalPosition { x, y }));
        }

        #[cfg(target_os = "windows")]
        {
            let hwnd_handle = window.hwnd().unwrap();
            let hwnd = windows::Win32::Foundation::HWND(hwnd_handle.0 as _);
            
            #[allow(unsafe_code)]
            unsafe {
                let dark_mode = 1i32;
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
