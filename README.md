# Spectra Studio (光谱工坊)

<p align="center">
  <img src="src/assets/logo.png" alt="Spectra Studio Logo" width="120" />
</p>

<p align="center">
  <strong>A high-performance, aesthetically pleasing database management client built for developers who care about design.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.0-24C8DB?style=flat-square&logo=tauri" alt="Tauri" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />

---

[English](./README.md) | [简体中文](./README_zh.md)

**Spectra Studio** is a modern database management tool that combines native performance with a premium, glassmorphism-inspired user interface. Designed to be lightweight and fast, it provides a seamless experience for managing your data across multiple database engines.

## 📸 Screenshots

|          New Connection          |       Data Explorer        |
| :------------------------------: | :------------------------: |
| ![Connection](docs/connectd.png) | ![Explorer](docs/home.png) |

## 📥 Download

Get the latest version of Spectra Studio for your platform:

| Platform          | Download                                                                                                                                        |
| :---------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Windows** (x64) | [**Spectra.Studio_0.3.5_x64-setup.exe**](https://github.com/dsxksss/spectra-studio/releases/download/v0.3.5/Spectra.Studio_0.3.5_x64-setup.exe) |
| **macOS / Linux** | Coming Soon                                                                                                                                     |

> [!NOTE]
> For all versions and release notes, please visit the [Releases](https://github.com/dsxksss/spectra-studio/releases) page.

## ✨ Features

### 🛠 Supported Databases

- **PostgreSQL**: Robust support for schemas, tables, views, and functions.
- **MySQL**: Full-featured management for your MySQL instances.
- **SQLite**: Local file management with a clean, intuitive interface.
- **Redis**: Specialized key-value browser supporting Strings, Hashes, Lists, and more.

### 🎨 Premium Design & UX

- **Glassmorphism UI**: A beautiful, modern interface with depth and translucency.
- **Dynamic Themes**: Interactive "Silk" background animations and customizable color palettes.
- **Database-Aware Themes**: Automatically adjusts the app's accent color based on the connected database type.
- **Micro-interactions**: Smooth transitions and hover effects powered by Framer Motion and Three.js.

### 🔐 Security & Connectivity

- **SSH Tunneling**: Built-in support for secure connections to remote databases via SSH.
- **Native Performance**: Compiled with Rust (Tauri), ensuring low resource usage and high responsiveness.

### 📊 Advanced Management

- **Smart Data Grid**: Interactive table browser with batch editing, search, and filtering.
- **SQL Console**: Powerful editor for running custom queries and viewing results in real-time.
- **I18n**: Fully localized in English and Chinese.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/) (v1.75+)
- [pnpm](https://pnpm.io/) (recommended)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/dsxksss/spectra-studio.git
   cd spectra-studio
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Run in development mode**

   ```bash
   pnpm tauri dev
   ```

4. **Build for production**
   ```bash
   pnpm tauri build
   ```

## 🛠 Tech Stack

- **Frontend**: [React](https://react.dev/), [Vite](https://vitejs.dev/)
- **Backend**: [Tauri 2.0](https://v2.tauri.app/) (Rust)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/), [Three.js](https://threejs.org/)
- **Icons**: [HugeIcons](https://hugeicons.com/), [Lucide](https://lucide.dev/)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
