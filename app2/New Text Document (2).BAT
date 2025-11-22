@echo off
title Veterinary App Launcher
echo 🚀 Starting Veterinary Medicine App...
cd C:\Users\Zane\Desktop\vetapp\app2
start npm start
timeout /t 3 >nul
start http://localhost:3000
echo ✅ App launched! You can close this window if you wish.