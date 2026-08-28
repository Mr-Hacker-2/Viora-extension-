@echo off
setlocal
set "CONTAINER_NAME=nim-server"
set "LOCAL_NIM_CACHE=%USERPROFILE%\.cache\nim"

if not exist "%LOCAL_NIM_CACHE%" mkdir "%LOCAL_NIM_CACHE%"

docker ps --format "{{.Names}}" | findstr /x /c:"%CONTAINER_NAME%" >nul
if %errorlevel%==0 (
  echo Viora NIM is already running.
  exit /b 0
)

docker ps -a --format "{{.Names}}" | findstr /x /c:"%CONTAINER_NAME%" >nul
if %errorlevel%==0 (
  docker start "%CONTAINER_NAME%"
  if errorlevel 1 (
    echo Failed to restart the existing Viora NIM container.
    pause
    exit /b 1
  )
  exit /b 0
)

echo Starting Viora NIM...
docker run -d --name "%CONTAINER_NAME%" --restart unless-stopped ^
  --runtime=nvidia --gpus all ^
  -p 8000:8000 ^
  -v "%LOCAL_NIM_CACHE%:/opt/nim/.cache/" ^
  nvcr.io/nim/wan-ai/wan2.2-animate-2-14b:latest

if errorlevel 1 (
  echo Failed to start Viora NIM. Check Docker Desktop and NVIDIA Container Toolkit.
  pause
  exit /b 1
)
echo Viora NIM started at http://localhost:8000.
endlocal
