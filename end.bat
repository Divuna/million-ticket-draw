@echo off
cd /d "C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw"
echo Co jste dnes delali? (napiste popis a stisknete Enter)
set /p POPIS="> "
git add -A
git commit -m "%POPIS%"
git push origin main
echo.
echo Hotovo! Kod je ulozen na GitHub.
pause
