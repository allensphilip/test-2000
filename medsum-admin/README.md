# Medsum Admin Dashboard

A modern admin dashboard built with [Astro](https://astro.build), [React](https://react.dev), and [Tailwind CSS](https://tailwindcss.com) for managing and monitoring the Medsum platform.

## Overview

Medsum Admin is a server-side rendered (SSR) web application that provides a comprehensive interface for:

- **Analytics Monitoring**: View transcription and summary quality metrics (WER, CER, BLEU scores)
- **Prompt Management**: Create, edit, and version control AI prompts
- **API Key Management**: Manage client API keys and access controls
- **Explanations Management**: Configure AI explanation templates
- **Microsoft Entra ID Authentication**: Secure login via Azure AD/Microsoft 365

## Features

### 📊 Analytics Dashboard

- **KPI Cards**: Real-time metrics for transcription and summary quality
- **Trend Visualization**: Charts showing WER/CER trends over time
- **Dual Analysis Views**: 
  - Transcription analysis with word-level corrections
  - Summary analysis with metadata (model, prompt, client tracking)
- **Interactive Tables**: Browse and filter analysis results

### 🔑 API Key Management

- List all registered clients
- View API credentials
- Rotate API keys
- Create and delete client configurations

### ✍️ Prompt Management

- Create and edit AI prompts
- Version control for prompt iterations
- Set active prompts per client
- Track prompt usage in summaries

### 📝 Explanations Management

- Configure explanation templates
- CRUD operations for explanations
- Associate explanations with summaries

### 🔐 Authentication

- Microsoft Entra ID (Azure AD) integration via [Better Auth](https://better-auth.com)
- SSO for organizational accounts
- Protected routes with session management
- Automatic redirect to login for unauthenticated users

## Tech Stack

- **Framework**: [Astro 5.14.5](https://astro.build) (SSR mode)
- **UI Library**: React 19.2.0 with TypeScript
- **Styling**: Tailwind CSS 4.1.14 with custom components
- **UI Components**: Radix UI primitives (dialogs, dropdowns, forms)
- **Authentication**: Better Auth 1.3.27 with Microsoft provider
- **Forms**: React Hook Form 7.65.0 + Zod 4.1.12 validation
- **Charts**: Custom chart components with trend visualization
- **Build**: Vite with standalone Node adapter

## Prerequisites

- Node.js 18+ or later
- pnpm package manager
- Access to Medsum API backend
- Access to Analytics API backend
- Microsoft Entra ID application credentials (for auth)

## Installation

```bash
cd medsum-admin
pnpm install
```

## Configuration

Create a `.env.local` file with the following environment variables:

```bash
# Application
APP_URL=http://localhost:4321

# Microsoft Entra ID (Azure AD) Authentication
AUTH_MICROSOFT_ENTRA_ID_ID=your-application-client-id
AUTH_MICROSOFT_ENTRA_ID_SECRET=your-application-client-secret
AUTH_MICROSOFT_ENTRA_TENANT_ID=your-tenant-id

# Medsum API Backend
MEDSUM_API_BASE_URL=http://localhost:3000
MEDSUM_API_KEY=your-internal-api-key

# Analytics API Backend
ANALYTICS_API_BASE_URL=http://localhost:8080
```

### Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `APP_URL` | Public URL of the admin dashboard | Yes | `https://admin.medsum.example.com` |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Azure AD application client ID | Yes | - |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Azure AD application client secret | Yes | - |
| `AUTH_MICROSOFT_ENTRA_TENANT_ID` | Azure AD tenant ID | Yes | - |
| `MEDSUM_API_BASE_URL` | Base URL for medsum-api backend | Yes | `http://localhost:3000` |
| `MEDSUM_API_KEY` | Internal API key for backend auth | Yes | - |
| `ANALYTICS_API_BASE_URL` | Base URL for analytics service | Yes | `http://localhost:8080` |

## Development

### Running Locally

```bash
pnpm dev
```

The application will start at `http://localhost:4321`

### Building for Production

```bash
pnpm build
```

### Preview Production Build

```bash
pnpm preview
```

## Project Structure

```
medsum-admin/
├── src/
│   ├── auth.ts                  # Better Auth configuration
│   ├── middleware.ts            # Route authentication middleware
│   ├── utils.ts                 # Utility functions
│   ├── components/              # React components
│   │   ├── analytics/          # Analytics dashboard components
│   │   │   ├── AnalyticsTabs.tsx
│   │   │   ├── BarChart.tsx
│   │   │   ├── CorrectionsTable.tsx
│   │   │   ├── Filters.tsx
│   │   │   ├── KpiCards.tsx
│   │   │   └── TrendChart.tsx
│   │   ├── api-keys/           # API key management
│   │   │   └── ClientsList.tsx
│   │   ├── auth/               # Authentication components
│   │   │   └── MicrosoftSignIn.tsx
│   │   ├── clients/            # Client management
│   │   │   └── ClientCards.tsx
│   │   ├── explanations/       # Explanation templates
│   │   │   └── ExplanationsPanel.tsx
│   │   ├── prompts/            # Prompt management
│   │   │   ├── DeleteConfirm.tsx
│   │   │   └── PromptEditorModal.tsx
│   │   ├── layout/             # Layout components
│   │   │   └── DashboardSidebar.tsx
│   │   └── ui/                 # Reusable UI primitives (shadcn/ui style)
│   ├── layouts/
│   │   └── main.astro          # Main layout template
│   ├── lib/
│   │   ├── analytics-api.ts    # Analytics API client
│   │   ├── api-config.ts       # API configuration
│   │   ├── api.ts              # Medsum API client
│   │   ├── auth-client.ts      # Auth client utilities
│   │   ├── client-selection.ts # Client selection logic
│   │   └── utils.ts            # Helper functions
│   ├── pages/
│   │   ├── index.astro         # Dashboard home
│   │   ├── analytics.astro     # Analytics dashboard
│   │   ├── api-keys.astro      # API key management
│   │   ├── explanations.astro  # Explanations management
│   │   ├── prompts.astro       # Prompt management
│   │   ├── labs.astro          # Experimental features
│   │   ├── login.astro         # Login page
│   │   ├── healthcheck.ts      # Health endpoint
│   │   └── api/                # API routes (proxy + internal)
│   │       ├── analytics/      # Analytics API proxy
│   │       │   ├── summary/    # Summary analysis routes
│   │       │   └── transcription/ # Transcription analysis routes
│   │       ├── auth/           # Better Auth routes
│   │       └── internal/       # Internal API routes
│   │           ├── api-keys/   # API key CRUD
│   │           ├── explanations/ # Explanation CRUD
│   │           └── prompts/    # Prompt CRUD
│   ├── server/
│   │   └── clients.ts          # Server-side client logic
│   └── styles/
│       └── global.css          # Global styles
├── public/                      # Static assets
├── helm/                        # Kubernetes Helm charts
│   ├── Chart.yaml
│   ├── values.yaml
│   ├── values.dev.yaml
│   ├── values.prod.yaml
│   └── templates/              # K8s resource templates
├── astro.config.mjs            # Astro configuration
├── components.json             # shadcn/ui configuration
├── tailwind.config.js          # Tailwind configuration (v4)
├── tsconfig.json               # TypeScript configuration
├── package.json
├── Dockerfile                  # Multi-stage Docker build
└── docker-compose.yml          # Local development setup
```

## API Routes

### Analytics Proxy Routes

Routes that proxy requests to the Analytics API:

- `GET /api/analytics/transcription/list` - List all transcription analyses
- `GET /api/analytics/transcription/:job` - Get specific transcription analysis
- `GET /api/analytics/transcription/:job/corrections` - Get word corrections
- `GET /api/analytics/summary/list` - List all summary analyses
- `GET /api/analytics/summary/:job` - Get specific summary analysis

### Internal API Routes

Routes that interact with Medsum API:

**Prompts:**
- `GET /api/internal/prompts` - List prompts (filtered by client)
- `POST /api/internal/prompts` - Create new prompt
- `DELETE /api/internal/prompts/:id` - Delete prompt
- `PUT /api/internal/prompts/:id/update` - Update prompt
- `POST /api/internal/prompts/:id/version` - Create new version
- `GET /api/internal/prompts/active` - Get active prompts

**API Keys:**
- `GET /api/internal/api-keys` - List API keys
- `POST /api/internal/api-keys` - Create API key
- `DELETE /api/internal/api-keys/:id` - Delete API key
- `POST /api/internal/api-keys/:id/rotate-key` - Rotate API key

**Explanations:**
- `GET /api/internal/explanations` - List explanations
- `POST /api/internal/explanations` - Create explanation
- `PUT /api/internal/explanations/:id` - Update explanation
- `DELETE /api/internal/explanations/:id` - Delete explanation

**Authentication:**
- `GET /api/auth/[...all]` - Better Auth routes (login, logout, session)

## Pages

- `/` - Dashboard home (redirects to login if unauthenticated)
- `/login` - Microsoft Entra ID login page
- `/analytics` - Analytics dashboard with metrics and visualizations
- `/prompts` - Prompt management interface
- `/api-keys` - API key management
- `/explanations` - Explanation template management
- `/labs` - Experimental features
- `/healthcheck` - Service health endpoint

## Docker Deployment

### Building the Image

```bash
docker build -t medsum-admin .
```

### Running with Docker Compose

```bash
docker-compose up
```

The Docker setup includes environment-based configuration for easy deployment.

## Kubernetes Deployment

### Using Helm

```bash
# Development
helm install medsum-admin ./helm -f helm/values.dev.yaml

# Production
helm install medsum-admin ./helm -f helm/values.prod.yaml
```

### Kubernetes Resources

The Helm chart includes:
- Deployment with configurable replicas
- Service (ClusterIP)
- Ingress with TLS support
- ServiceAccount
- Horizontal Pod Autoscaler (HPA)
- Health checks (liveness/readiness probes)
- Secrets management for environment variables

### Required Secrets

Create Kubernetes secrets for:
- `auth-credentials` - Microsoft Entra ID credentials
- `medsum-api-credentials` - Backend API configuration
- `harbor-read` - Container registry pull secret (if using private registry)

See `docs/kubernetes/secrets/` for detailed secret templates.

## Authentication Setup

### Microsoft Entra ID Application Setup

1. Register an application in Azure Portal
2. Add redirect URIs:
   - Development: `http://localhost:4321/api/auth/callback/microsoft`
   - Production: `https://your-domain.com/api/auth/callback/microsoft`
3. Generate a client secret
4. Note the Application (client) ID and Tenant ID
5. Configure environment variables with these credentials

## Development Guidelines

### Adding New Components

UI components follow the [shadcn/ui](https://ui.shadcn.com/) pattern:
- Place in `src/components/ui/`
- Use Radix UI primitives
- Style with Tailwind CSS
- Export as React components

### Adding New Pages

1. Create `.astro` file in `src/pages/`
2. Use `MainLayout` for consistent UI
3. Add authentication check: `if (!user) return Astro.redirect('/login')`
4. Update sidebar navigation in `DashboardSidebar.tsx`

### Adding New API Routes

1. Create handler in `src/pages/api/`
2. Export named functions: `GET`, `POST`, `PUT`, `DELETE`
3. Use `APIRoute` type from Astro
4. Return proper HTTP status codes

## Troubleshooting

### Authentication Issues

- Verify Microsoft Entra ID credentials are correct
- Check redirect URIs match application registration
- Ensure tenant ID is correct
- Check browser cookies are enabled

### API Connection Issues

- Verify `MEDSUM_API_BASE_URL` and `ANALYTICS_API_BASE_URL` are reachable
- Check API keys are valid
- Verify CORS settings on backend APIs
- Check network policies in Kubernetes (if deployed)

### Build Errors

- Clear node_modules and reinstall: `rm -rf node_modules && pnpm install`
- Clear Astro cache: `rm -rf .astro`
- Check TypeScript errors: `pnpm astro check`

## License

Proprietary - Carasent/Medsum Platform

## Support

For issues or questions, contact the Medsum development team.
