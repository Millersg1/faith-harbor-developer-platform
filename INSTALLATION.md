# Faith Harbor OS v4.0 Installation

```powershell
git pull

Expand-Archive `
  -Path "$HOME\Downloads\Faith-Harbor-OS-v4.0.zip" `
  -DestinationPath ".\v4.0-temp" `
  -Force

powershell -ExecutionPolicy Bypass `
  -File ".\v4.0-temp\Faith-Harbor-OS-v4.0\INSTALL-v4.0.ps1"

npm install
npm run validate
git status
```

Do not commit until validation passes.
