# TersooPilot Backend & SaaS Architecture Roadmap (Phases 2 & 3)

This document outlines the end-to-end design, implementation plan, and scaling strategy for the TersooPilot SaaS platform. It details how the desktop client integrates with a centralized **Python / Django** backend hosted initially on **Namecheap Shared Hosting**, accelerated and protected by **Cloudflare Workers & CDN**, and later migrated to a high-performance **VPS with PostgreSQL**.

---

## 1. System Topology & High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TersooPilot Desktop Client                       │
│  - Chromium Engines (Apostate / Camoufox)                                   │
│  - Local Encrypted Keytar / AES-256 Vault (BYOK: OpenRouter / Gemini)       │
│  - License Activation & Session Token Cache                                 │
└───────────────┬─────────────────────────────────────────────┬───────────────┘
                │ Direct BYOK AI Queries (Zero Cloud Cost)    │
                ▼                                             │
      ┌─────────────────────────┐                             │
      │ OpenRouter / Google API │                             │
      └─────────────────────────┘                             │
                                                              │ 1. License Check / Subscription
                                                              │ 2. Managed AI Token Stream (Subscribers)
                                                              ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │                 Cloudflare Edge Gateway                 │
                  │  - Global CDN, DDoS Mitigation, Free Universal SSL     │
                  │  - Cloudflare Worker: Ultra-fast Streaming AI Proxy     │
                  └────────────┬───────────────────────────────┬────────────┘
                               │                               │
           Fast Auth / License │                               │ Heavy AI Streaming Pipe
           REST Queries (<50ms)│                               │ (Bypasses Namecheap!)
                               ▼                               ▼
    ┌─────────────────────────────────────────┐   ┌─────────────────────────┐
    │     Phase 2: Namecheap Shared Hosting   │   │ OpenRouter / Google API │
    │     (Later Phase 3: Dedicated VPS)      │   │ (With Master SaaS Key)  │
    │  - Python 3.11+ / Django (Passenger)    │   └─────────────────────────┘
    │  - MySQL Database (cPanel phpMyAdmin)   │
    │  - Django Admin Back-Office             │
    │  - Stripe Webhooks & Billing Sync       │
    └────────────────────┬────────────────────┘
                         │
                         ▼
             ┌───────────────────────┐
             │     Stripe Billing    │
             │ - Customer Portal     │
             │ - Recurring Webhooks  │
             └───────────────────────┘
```

---

## 2. Phase 2: Implementation Plan (Django on Namecheap + Cloudflare)

### 2.1 Why This Setup Is Optimal for Launch
- **Cost**: Near $0 incremental cost (uses existing Namecheap hosting + Cloudflare Free Tier).
- **Separation of Concerns**:
  - **Namecheap** handles low-bandwidth, transactional requests (login, license checks, subscription webhooks, Django Admin).
  - **Cloudflare Worker** handles streaming AI connections and heavy screenshot uploads, shielding Namecheap from connection timeout limits (e.g. 30–60s Passenger limits).

### 2.2 Django Data Architecture (Models)
Create a Django app named `licensing`:

```python
# licensing/models.py
import uuid
from django.db import models
from django.contrib.auth.models import User

class CustomerProfile(models.Model):
    PLAN_CHOICES = [
        ('free_trial', 'Free Trial'),
        ('starter', 'Starter ($29/mo)'),
        ('pro', 'Pro ($79/mo)'),
        ('enterprise', 'Enterprise ($199/mo)'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    stripe_customer_id = models.CharField(max_length=120, blank=True, null=True, db_index=True)
    stripe_subscription_id = models.CharField(max_length=120, blank=True, null=True)
    plan = models.CharField(max_length=30, choices=PLAN_CHOICES, default='free_trial')
    is_active = models.BooleanField(default=True)
    max_devices = models.PositiveIntegerField(default=2)
    ai_credits_monthly = models.IntegerField(default=500) # For managed AI tier
    ai_credits_used = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class LicenseKey(models.Model):
    key = models.CharField(max_length=64, unique=True, default=uuid.uuid4, db_index=True)
    customer = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name='licenses')
    label = models.CharField(max_length=100, default='Default Machine')
    created_at = models.DateTimeField(auto_now_add=True)
    revoked = models.BooleanField(default=False)

class MachineActivation(models.Model):
    license = models.ForeignKey(LicenseKey, on_delete=models.CASCADE, related_name='activations')
    hardware_fingerprint = models.CharField(max_length=128, db_index=True)
    hostname = models.CharField(max_length=120, blank=True)
    os_info = models.CharField(max_length=120, blank=True)
    app_version = models.CharField(max_length=20, default='1.0.0')
    last_heartbeat = models.DateTimeField(auto_now=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
```

### 2.3 Django Admin Superpowers
Register these models with search, filters, and custom actions:
- **Instant Revocation**: Ban or revoke any leaked license key with one click.
- **Manual Grants**: Grant complimentary days or upgrade a user's tier directly inside Django Admin.
- **Fleet Overview**: View all active desktop machines, OS versions, and last heartbeat timestamps.

### 2.4 Stripe Webhook Integration
Install `stripe`:
```bash
pip install stripe django-ninja
```
Create a webhook receiver in Django:
```python
# licensing/api.py
from django.views.decorators.csrf import csrf_exempt
import stripe

@csrf_exempt
def stripe_webhook(request):
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')
    event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)

    if event['type'] == 'invoice.payment_succeeded':
        # Refresh subscription, reset monthly credits, set is_active=True
        pass
    elif event['type'] == 'customer.subscription.deleted':
        # Mark profile.is_active = False -> Desktop app is immediately alerted
        pass
```

### 2.5 Cloudflare Worker: Streaming AI Edge Gateway (Zero Namecheap Load)
A lightweight Cloudflare Worker (under 50 lines) deployed for free:
1. Receives `POST /v1/ai/stream` from Desktop with header `Authorization: Bearer <USER_JWT>`.
2. Validates JWT signature using your Django secret key (in < 2ms at edge).
3. Injects your server's master OpenRouter or Gemini API key.
4. Streams tokens directly to the desktop app. Namecheap never touches the high-bandwidth AI stream.

---

## 3. Phase 3: VPS Migration & Scaling Strategy

When active user subscriptions exceed 500+ or when centralized cloud profile backups are required, execute the zero-downtime migration to a dedicated VPS.

### 3.1 Recommended Infrastructure (Hetzner / DigitalOcean)
- **Host**: Hetzner CX22 / CX32 (Germany / Finland) or DigitalOcean Droplet ($6 – $12/month).
- **Specs**: 2 vCPU, 4GB RAM, 40GB NVMe SSD.
- **OS**: Ubuntu 24.04 LTS.
- **Stack**:
  - Nginx (Reverse Proxy & SSL termination).
  - Gunicorn / Uvicorn (ASGI async workers for Django).
  - PostgreSQL 16 (Relational database with connection pooling via PgBouncer).
  - Redis 7 (Token cache and Celery background task broker).

### 3.2 Zero-Downtime Migration Steps (Takes ~10 Minutes)
1. **Prepare VPS**:
   - Provision Ubuntu server, install Docker or Python 3.12 + PostgreSQL.
   - Run Django migrations to prepare tables.
2. **Data Export from Namecheap**:
   - Enter cPanel phpMyAdmin $\rightarrow$ Export MySQL database as `.sql`.
   - Use `pgloader` or Django's built-in `dumpdata` / `loaddata`:
     ```bash
     # On Namecheap:
     python manage.py dumpdata --exclude auth.permission --exclude contenttypes > backup.json
     # On VPS:
     python manage.py loaddata backup.json
     ```
3. **Cloudflare DNS Cutover**:
   - In the Cloudflare Dashboard, update the `A` record for `api.tersoopilot.com` from Namecheap's IP to the new VPS IP.
   - **Because Cloudflare proxies the traffic, the switch happens instantly across the world with zero downtime and zero app reconfiguration!**

---

## 4. Desktop Client Integration Points

In the TersooPilot Desktop code, the architecture remains clean and decoupled:
- **`packages/contracts/src/auth.ts`**: Contains License and Session schemas.
- **`packages/core/src/services/LicenseService.ts`**: Handles periodic heartbeats to `https://api.tersoopilot.com/v1/license/verify`.
- **`packages/core/src/llm/LlmService.ts`**:
  - When in **BYOK Mode**: Calls OpenRouter or Gemini directly with user's encrypted local key.
  - When in **Subscription Mode**: Calls `https://api.tersoopilot.com/v1/ai/stream`.

---
*Created on 2026-10-02 as the official architectural roadmap for TersooPilot SaaS.*
