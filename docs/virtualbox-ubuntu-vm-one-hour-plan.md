# VirtualBox Ubuntu VM One-Hour Plan

- Updated: 2026-03-12
- Goal: get one dedicated Windows host to the first working Ubuntu VM backend within about one hour

## Before You Start

Prepare these first:

- one dedicated Windows host
- VirtualBox installer
- Ubuntu Server 24.04 LTS ISO
- this repo available by Git clone or ZIP
- the M365 account that already works for SharePoint site-owner access

## 0-10 Minutes

1. Install VirtualBox
2. Create one VM named `isms-unit-contact`
3. Allocate:
   - 2 vCPU
   - 4 GB RAM
   - 40 GB disk
4. Set networking to `Bridged Adapter`

## 10-25 Minutes

1. Boot the Ubuntu Server ISO
2. Install Ubuntu Server
3. Set a hostname such as:
   - `isms-api-vm`
4. Enable OpenSSH during setup if available
5. Finish install and reboot

## 25-35 Minutes

1. Sign in to Ubuntu
2. Install baseline packages:

```bash
sudo apt update
sudo apt install -y git curl caddy
```

3. Install Node.js LTS
4. Create the app folder:

```bash
sudo mkdir -p /srv/isms-form-redesign
sudo chown "$USER":"$USER" /srv/isms-form-redesign
```

## 35-45 Minutes

1. Copy or clone the repo into:

```bash
/srv/isms-form-redesign
```

2. Copy:

```text
m365/campus-backend/ubuntu/runtime.ubuntu.sample.json
```

to:

```text
m365/campus-backend/runtime.local.json
```

3. Fill:

- `allowedOrigins`
- `sharePointSiteId`
- `sharePointSiteUrl`
- `logDir`

## 45-50 Minutes

1. Sign in to M365 from inside Ubuntu with CLI for Microsoft 365
2. Run one direct health check for the backend

Target:

- SharePoint site reads successfully
- required lists are visible

## 50-55 Minutes

1. Copy the systemd unit:

```text
m365/campus-backend/ubuntu/systemd/isms-unit-contact-backend.service
```

2. Adjust the Linux user if needed
3. Enable and start the service

## 55-60 Minutes

1. Copy the sample Caddy file:

```text
m365/campus-backend/ubuntu/Caddyfile.sample
```

2. Point it at `127.0.0.1:8787`
3. Restart Caddy
4. Confirm:
   - backend health responds
   - frontend can point to the VM

## First Success Criteria

At the end of the first hour, you want:

- one Ubuntu VM running
- one healthy backend process
- one successful SharePoint health check
- one reachable backend URL for the frontend

## Then Do These Next

After the first hour, continue with:

1. point `m365-config.override.js` at the VM
2. run one real test submission
3. confirm one row in `UnitContactApplications`
4. confirm one row in `OpsAudit`
5. take one clean VirtualBox snapshot
