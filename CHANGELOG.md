# Changelog

All notable changes to this project will be documented in this file.

## [0.6.2] - 2024-11-11

### New Features

- Add file sync feature, now you can get the files cached by the peer 添加文件同步功能，现在可以获取对方缓存的文件

- Add strong password generation function 添加强密码生成功能

### Improvements

- Improve the file search function 优化文件搜索功能

- Using crypto-js for encryption in non-secure contexts 在非安全上下文中使用 crypto-js 进行加密

### Bug Fixes

- Fix the bug that the file chunk cannot be received when resuming 修复了续传时文件区块接收的问题

- Fix the bug that messageChannel is undefined 修复了 messageChannel 未定义的问题

## [0.5.0] - 2024-11-04

### New Features

- Add Share Target API support, you can share files to Weblink from other apps 添加 Share Target API 支持，可以从其他应用分享文件到 Weblink

- Add forward menu option in file table 在文件表中添加转发菜单选项

### Bug Fixes

- Fix some i18n issues 修复一些 i18n 问题

## [0.4.1] - 2024-11-03

### New Features

- Add redirect option after connection in client menu 在客户端菜单中添加连接后重定向选项

- QR code dialog now displays your name 二维码对话框现在会显示自己的用户名

### Improvements

- Move the file chunk merge process to Web Worker to improve performance 将文件区块合并流程转移到 Web Worker 中提高性能

## [0.4.0] - 2024-11-01

### New Features

- Add folder transfer feature 添加文件夹传输功能

### Improvements

- Use Web Worker to compress and uncompress files 使用 Web Worker 压缩和解压缩文件

## [0.3.3] - 2024-10-31

### Bug Fixes

- Fix the bug that the message cannot be scrolled to the bottom when the client is online 修复了当客户端在线时消息无法滚动到底部的问题

### Improvements

- Improve the animation of the message 优化消息的动画

- Improve the date format 优化日期格式

## [0.3.2] - 2024-10-30

### New Features

- Add clipboard history dialog 添加剪贴板历史对话框

## [0.3.1] - 2024-10-29

### Bug Fixes

- Fix the bug that the application cannot be used in a non-secure context 解决了应用在非安全上下文无法使用的问题

## [0.3.0] - 2024-10-28

### New Features

- Add clipboard paste feature 添加剪贴板粘贴功能
