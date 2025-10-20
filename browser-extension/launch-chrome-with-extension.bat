@echo off
REM Launch Chrome with Soul Observer Extension loaded
REM This bypasses the file picker dialog

set EXTENSION_PATH=%~dp0
set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"

REM Alternative Chrome paths
if not exist %CHROME_PATH% set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% set CHROME_PATH="%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

echo Loading Soul Observer Extension...
echo Extension path: %EXTENSION_PATH%
echo.
echo Chrome will launch with extension pre-loaded.
echo.

%CHROME_PATH% --load-extension="%EXTENSION_PATH%" --no-first-run --disable-extensions-file-access-check

pause
