# Faith Harbor OS v4.1 Installation

```powershell
git pull

Expand-Archive `
  -Path "$HOME\Downloads\Faith-Harbor-OS-v4.1.zip" `
  -DestinationPath ".\v4.1-temp" `
  -Force

powershell -ExecutionPolicy Bypass `
  -File ".\v4.1-temp\Faith-Harbor-OS-v4.1\INSTALL-v4.1.ps1"

npm install
npm run validate
git status
```

Do not commit until validation passes.
