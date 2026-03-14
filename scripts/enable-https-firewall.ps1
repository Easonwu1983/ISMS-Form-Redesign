Write-Host 'Adding inbound firewall rule for TCP 80...'
netsh advfirewall firewall add rule name="ISMS HTTPS 80" dir=in action=allow protocol=TCP localport=80

Write-Host 'Adding inbound firewall rule for TCP 443...'
netsh advfirewall firewall add rule name="ISMS HTTPS 443" dir=in action=allow protocol=TCP localport=443

Write-Host 'Current TCP 80/443 firewall rules:'
netsh advfirewall firewall show rule name=all | findstr /i "ISMS HTTPS 80 ISMS HTTPS 443 caddy.exe 80 443"
