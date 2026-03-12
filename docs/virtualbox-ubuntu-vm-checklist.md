# VirtualBox Ubuntu VM Checklist

- Updated: 2026-03-12
- Scope: dedicated Windows host running one Ubuntu Server VM for the campus backend

## 1. Windows Host

- [ ] Host machine is dedicated or low-change
- [ ] Sleep and hibernation are disabled
- [ ] Windows updates are scheduled outside service hours
- [ ] Enough free disk exists for VM growth
- [ ] Enough RAM exists to reserve 4 GB or more for the VM

## 2. VirtualBox

- [ ] VirtualBox is installed
- [ ] One Ubuntu Server VM is created
- [ ] VM is configured with at least 2 vCPU / 4 GB RAM / 40 GB disk
- [ ] One pre-deploy snapshot is created

## 3. Ubuntu Server

- [ ] Ubuntu Server 24.04 LTS is installed
- [ ] SSH access is working
- [ ] Static IP or stable DHCP reservation is set
- [ ] Hostname is final
- [ ] Time sync works

## 4. Runtime

- [ ] Node.js LTS installed
- [ ] Git installed
- [ ] Caddy installed
- [ ] Repo cloned to `/srv/isms-form-redesign`
- [ ] `runtime.local.json` created from sample

## 5. M365

- [ ] CLI for Microsoft 365 login completed inside the Ubuntu VM
- [ ] Health endpoint can read SharePoint site
- [ ] Health endpoint can read all required lists

## 6. Service

- [ ] systemd unit file copied
- [ ] service enabled on boot
- [ ] service starts cleanly
- [ ] service restarts cleanly

## 7. Reverse Proxy

- [ ] Caddyfile copied and adjusted
- [ ] reverse proxy points to `127.0.0.1:8787`
- [ ] external URL works
- [ ] health endpoint works through reverse proxy if desired

## 8. Frontend

- [ ] `m365-config.override.js` points to the VM hostname
- [ ] `/#apply-unit-contact` works
- [ ] `/#apply-unit-contact-status` works

## 9. Validation

- [ ] one test submission writes to `UnitContactApplications`
- [ ] one audit row writes to `OpsAudit`
- [ ] lookup by email returns the newest item
- [ ] backend logs are readable

## 10. Operations

- [ ] backup plan exists for VM
- [ ] rollback snapshot exists
- [ ] someone else knows how to restart the service
- [ ] deployment notes are stored with the project docs
