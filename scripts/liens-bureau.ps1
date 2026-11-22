# Liste les liens des raccourcis du Bureau Windows et les copie dans le presse-papiers.
# Utilisation : clic droit sur ce fichier → « Exécuter avec PowerShell », puis colle le résultat à Claude.
$bureau = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$lignes = Get-ChildItem -Path $bureau, "$env:PUBLIC\Desktop" -Include *.url, *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_.Extension -eq '.url') {
    $u = (Get-Content $_.FullName | Where-Object { $_ -like 'URL=*' }) -replace '^URL=', ''
    "$($_.BaseName) = $u"
  } else {
    $s = $shell.CreateShortcut($_.FullName)
    "$($_.BaseName) = $($s.TargetPath) $($s.Arguments)"
  }
}
$lignes | Set-Clipboard
$lignes
Write-Host "`nC'est copié ! Colle-le dans la conversation avec Claude." -ForegroundColor Green
Read-Host "Appuie sur Entrée pour fermer"
