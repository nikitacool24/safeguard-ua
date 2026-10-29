@echo off
title SafeGuard UA — Моніторинг загроз
cd /d "%~dp0"
echo ========================================================
echo   SafeGuard UA — Моніторинг загроз України
echo   Запуск локального сервера: http://localhost:8080/
echo ========================================================
python server.py
pause
