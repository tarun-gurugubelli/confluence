# Confluence

A Confluence-style web client. The frontend (Angular 21 + Tailwind CSS) is
deployed to GitHub Pages at <https://wiki.tarun.win>. The backend (FastAPI
wrapped with Mangum) runs as a single AWS Lambda function exposed through a
Function URL, and talks to Confluence Cloud's REST API on your behalf.

The repository covers the whole stack: local development, AWS deployment via
SAM, and the GitHub Actions pipeline that publishes the frontend to Pages on
every push to `main`.

---

## Table of contents

1. [Architecture](#architecture)
2. [Tech stack](#tech-stack)
3. [Repository layout](#repository-layout)
4. [Prerequisites](#prerequisites)
5. [Step 1 - Get your Confluence credentials](#step-1---get-your-confluence-credentials)
6. [Step 2 - Get your AWS credentials and configure the CLI](#step-2---get-your-aws-credentials-and-configure-the-cli)
7. [Step 3 - Clone and run locally](#step-3---clone-and-run-locally)
8. [Step 4 - Deploy the backend to AWS Lambda](#step-4---deploy-the-backend-to-aws-lambda)
9. [Step 5 - Deploy the frontend to GitHub Pages](#step-5---deploy-the-frontend-to-github-pages)
10. [Day-to-day workflows](#day-to-day-workflows)
11. [Configuration reference](#configuration-reference)
12. [API reference](#api-reference)
13. [Troubleshooting](#troubleshooting)

---

## Architecture

```
        ┌──────────────────────────┐         ┌──────────────────────────┐
        │  wiki.tarun.win          │  HTTPS  │  AWS Lambda Function URL │
        │  (GitHub Pages, Angular) │ ──────► │  FastAPI + Mangum        │
        └──────────────────────────┘         └─────────────┬────────────┘
                                                           │
                                                           │  Confluence REST v2
                                                           ▼
                                                 ┌────────────────────────┐
                                                 │  Confluence Cloud      │
                                                 │  (atlassian.net/wiki)  │
                                                 └────────────────────────┘
```

- **Browser** holds no secrets. The Angular bundle only knows the public
  Lambda Function URL.
- **Lambda** holds the Confluence API token in its environment variables, plus
  a registration password used to gate write endpoints. It calls Confluence
  Cloud REST API v2 using HTTP Basic auth (email + API token).
- **CORS** allows requests from `https://wiki.tarun.win` and
  `http://localhost:4200`. Other origins get blocked by the browser.
- **Writes** (create space / folder / page) require the
  `X-Registration-Password` header. The frontend collects the password on the
  Registration screen and stores it in `sessionStorage`.

There is no database. Every read hits Confluence live; every write goes
straight into Confluence.

### Why a backend at all?

A pure browser SPA cannot call Confluence Cloud's REST API directly: Atlassian
doesn't send permissive CORS headers, and embedding an API token in the static
bundle would expose it to anyone who visits the site. The Lambda solves both:
CORS is satisfied because the SPA only talks to the Lambda's Function URL, and
the API token lives only in the Lambda's environment.

---

## Tech stack

| Layer    | Technology                                                    |
| -------- | ------------------------------------------------------------- |
| Frontend | Angular 21 (standalone, signals, zoneless), Tailwind CSS v4   |
| Backend  | FastAPI, Pydantic v2, httpx, Mangum (ASGI -> Lambda adapter)  |
| Hosting  | GitHub Pages (frontend), AWS Lambda Function URL (backend)    |
| Packaging| AWS SAM (`template.yaml` + `samconfig.toml`)                  |
| CI/CD    | GitHub Actions (`.github/workflows/deploy-pages.yml`)         |

---

## Repository layout

```
confluence/
├── backend/
│   ├── app/
│   │   ├── auth.py              X-Registration-Password gate for writes
│   │   ├── config.py            Settings loaded from env / .env
│   │   ├── confluence_client.py REST v2 client + tree assembly
│   │   ├── main.py              FastAPI app + Mangum Lambda handler
│   │   ├── models.py            Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── auth.py          POST /api/auth/verify
│   │   │   ├── content.py       GET/POST pages, POST folders
│   │   │   └── spaces.py        GET/POST spaces, GET tree
│   │   └── service.py           Calls confluence_client, normalises shapes
│   ├── requirements.txt
│   ├── template.yaml            AWS SAM stack (Lambda + Function URL)
│   ├── samconfig.toml           SAM CLI defaults (stack name, region, params)
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/            Models, services (HTTP, theme, auth), guards
│   │   │   ├── features/        home/, registration/
│   │   │   └── shared/header/
│   │   ├── environments/
│   │   │   ├── environment.ts       dev:  apiBase = '/api'
│   │   │   └── environment.prod.ts  prod: apiBase = <Lambda URL>/api
│   │   ├── styles.css           Tailwind import + theme + .page-content rules
│   │   └── index.html
│   ├── public/
│   │   └── CNAME                wiki.tarun.win (custom domain marker)
│   ├── proxy.conf.json          Dev-only: /api -> http://localhost:8000
│   ├── .postcssrc.json          Wires @tailwindcss/postcss into the build
│   └── angular.json
├── .github/workflows/
│   └── deploy-pages.yml         Push to main -> build + deploy to Pages
└── README.md
```

---

## Prerequisites

Install these once on your development machine. Versions listed are minimums
known to work.

| Tool             | Version | macOS install                                       |
| ---------------- | ------- | --------------------------------------------------- |
| Git              | any     | `brew install git`                                  |
| Node.js          | 20+     | `brew install node@20`                              |
| Python           | 3.13    | `brew install python@3.13`                          |
| Docker Desktop   | latest  | `brew install --cask docker` then launch the app    |
| AWS CLI v2       | latest  | `brew install awscli`                               |
| AWS SAM CLI      | 1.140+  | `brew install aws-sam-cli`                          |
| Angular CLI      | 21+     | `npm install -g @angular/cli`                       |

You will also need:

- An **Atlassian Cloud** account with at least one Confluence space.
- An **AWS** account.
- A **GitHub** account (for hosting and CI/CD).
- A **domain you control** (optional - you can stay on `<user>.github.io` if
  you don't want a custom domain).

---

## Step 1 - Get your Confluence credentials

You need three values:

1. **Base URL** - the address of your Confluence Cloud site, including `/wiki`.
   - Sign in to Confluence in the browser.
   - The address bar shows `https://<workspace>.atlassian.net/wiki/spaces/...`.
   - Strip everything after `/wiki`. The base URL is e.g.
     `https://acme.atlassian.net/wiki`.

2. **Email** - the Atlassian account email you use to sign in
   (e.g. `you@example.com`).

3. **API token** - a per-account secret used in place of a password.
   - Go to <https://id.atlassian.com/manage-profile/security/api-tokens>.
   - Click **Create API token**, name it (e.g. `confluence-client`), click
     **Create**, then **Copy**. You only see the value once - save it
     somewhere safe.

Keep these three values handy. You will paste them into:

- `backend/.env` for local development, and
- the SAM `parameter_overrides` (or the `--guided` prompts) for the Lambda
  deployment.

---

## Step 2 - Get your AWS credentials and configure the CLI

### 2.1 Create an AWS account

If you don't already have one, sign up at <https://aws.amazon.com/>. The free
tier covers the Lambda usage for this project comfortably for a personal site.

### 2.2 Create an IAM user for the CLI

Root user credentials should not be used for day-to-day work. Create a
separate IAM user instead:

- Sign in to <https://console.aws.amazon.com/>.
- Open **IAM** -> **Users** -> **Create user**.
- User name: e.g. `sam-deployer`.
- Skip "Provide user access to the AWS Management Console" (CLI-only is fine).
- On the **Permissions** step, attach a managed policy:
  - **Easy mode** (recommended for a personal project): `AdministratorAccess`.
  - **Least privilege**: `AWSCloudFormationFullAccess` +
    `AWSLambda_FullAccess` + `IAMFullAccess` + `AmazonS3FullAccess`.
- **Create user**.

### 2.3 Generate an access key

- Open the new user -> **Security credentials** tab -> **Create access key**.
- Use case: **Command Line Interface (CLI)**.
- Acknowledge the warning, then **Create access key**.
- **Copy the Access key ID and Secret access key now**. The secret is only
  shown once. Download the `.csv` if you want a backup.

### 2.4 Configure the AWS CLI

```bash
aws configure
```

Paste the values when prompted:

```
AWS Access Key ID [None]:     <paste access key ID>
AWS Secret Access Key [None]: <paste secret access key>
Default region name [None]:   us-east-1
Default output format [None]: json
```

The region must match `samconfig.toml` (`region = "us-east-1"`). Change one or
the other if you prefer a different region.

### 2.5 Verify

```bash
aws sts get-caller-identity
# {
#   "UserId": "AIDA...",
#   "Account": "123456789012",
#   "Arn":     "arn:aws:iam::123456789012:user/sam-deployer"
# }
```

If you see your account ID, you are ready to deploy.

---

## Step 3 - Clone and run locally

```bash
git clone <your-repo-url> confluence
cd confluence
```

### 3.1 Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env`:

```
CONFLUENCE_BASE_URL=https://acme.atlassian.net/wiki
CONFLUENCE_EMAIL=you@example.com
CONFLUENCE_API_TOKEN=<token from step 1>
REGISTRATION_PASSWORD=M@dhuri8797
CORS_ORIGINS=http://localhost:4200,https://wiki.tarun.win
```

Run:

```bash
uvicorn app.main:app --reload --port 8000
```

Verify:

```bash
curl http://localhost:8000/api/health
# {"status":"ok"}
curl http://localhost:8000/api/config
# {"configured":true}
```

If `configured` is `false`, one of the three Confluence variables is empty or
misspelled.

### 3.2 Frontend

In a second terminal:

```bash
cd frontend
npm install
npm start
```

Open <http://localhost:4200>. The Angular dev server proxies `/api/*` to your
uvicorn on port 8000 (see `proxy.conf.json`).

- **Home** screen: sidebar lists every space; expand a space to see folders
  and pages; click a page to render its content.
- **Register** screen: enter the registration password (`M@dhuri8797`), then
  use the forms to create a space, folder, or page in Confluence.
- **Dark theme**: toggle via the sun/moon icon in the header. The choice
  persists in `localStorage`.

---

## Step 4 - Deploy the backend to AWS Lambda

### 4.1 First-time deploy (guided)

```bash
cd backend
sam build --use-container
sam deploy --guided
```

`sam build --use-container` builds inside an Amazon Linux container so the
resulting zip works on Lambda even if you're on Apple Silicon. Requires Docker
Desktop to be running.

`sam deploy --guided` prompts for:

- Stack name (accept default `confluence-client-api`).
- Region (accept default `us-east-1`).
- The five parameters: `ConfluenceBaseUrl`, `ConfluenceEmail`,
  `ConfluenceApiToken`, `RegistrationPassword`, `CorsOrigins`.
- "Allow SAM CLI IAM role creation" -> **Y**.
- "Disable rollback" -> **N**.
- "Save arguments to configuration file" -> **Y**.

When it finishes, the **Outputs** section prints `ApiUrl`. Save it - this is
your Lambda Function URL, e.g.:

```
https://abc123xyz.lambda-url.us-east-1.on.aws/
```

### 4.2 Sanity-check the deployed backend

```bash
URL=https://abc123xyz.lambda-url.us-east-1.on.aws

curl $URL/api/health        # {"status":"ok"}
curl $URL/api/config        # {"configured":true}
curl $URL/api/spaces | head # your real Confluence spaces
```

If `/api/config` says `configured: false`, the env vars weren't applied. Open
the Lambda in the AWS console -> Configuration -> Environment variables and
fix them, or re-run `sam deploy --guided`.

### 4.3 Subsequent deploys

`samconfig.toml` now holds your stack name, region, and (for the non-secret
parameters) the values. Future deploys are just:

```bash
sam build --use-container
sam deploy
```

It applies to any change in `app/`, `template.yaml`, or `requirements.txt`.

### 4.4 Updating the API token or registration password

These are marked `NoEcho` in the SAM template and are **not** saved in
`samconfig.toml`. CloudFormation reuses the previously deployed value unless
you override it:

```bash
sam deploy --parameter-overrides \
    ConfluenceApiToken=ATATT3xFf... \
    RegistrationPassword=newpassword
```

Alternatively edit them in the AWS console (**Lambda -> confluence-client-api
-> Configuration -> Environment variables**). Console edits are immediate but
get overwritten the next time you `sam deploy` unless you also pass the new
value via `--parameter-overrides`.

---

## Step 5 - Deploy the frontend to GitHub Pages

### 5.1 Set the API base URL repository variable

The CI workflow needs to know your Lambda URL.

- In GitHub: **Settings -> Secrets and variables -> Actions -> Variables tab
  -> New repository variable**.
- Name: `API_BASE_URL`.
- Value: your Lambda URL **with `/api` appended**, no trailing slash:

  ```
  https://abc123xyz.lambda-url.us-east-1.on.aws/api
  ```

This is a *variable*, not a secret. The Lambda URL is not sensitive: CORS and
the registration-password header are what protect it.

### 5.2 Configure GitHub Pages

- **Settings -> Pages**.
- **Source**: GitHub Actions.
- **Custom domain**: `wiki.tarun.win` (or leave blank to stay on
  `<user>.github.io`).

### 5.3 Point DNS at GitHub Pages (only if using a custom domain)

At your DNS provider for `tarun.win`, add a record:

```
Type: CNAME    Host: wiki    Value: <your-github-username>.github.io
```

Alternatively, A records pointing to GitHub's apex IPs:
`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.

Propagation usually takes a few minutes. Verify:

```bash
dig wiki.tarun.win +short
```

Once DNS resolves, GitHub provisions a Let's Encrypt certificate automatically
(a few more minutes). Then go back to **Settings -> Pages** and tick
**Enforce HTTPS**.

### 5.4 Push to `main`

```bash
git checkout main
git merge dev          # bring your changes from dev
git push origin main
```

Watch the run at **Actions -> Deploy frontend to GitHub Pages**. The workflow:

1. Installs dependencies (`npm install`).
2. Writes `src/environments/environment.prod.ts` with the `API_BASE_URL`
   value.
3. Runs `ng build` (production config swaps in `environment.prod.ts`).
4. Copies `index.html` to `404.html` so Angular routes survive a hard reload
   on a non-root path.
5. Touches `.nojekyll` so GitHub Pages doesn't try to run Jekyll over the
   build output.
6. Uploads the build as a Pages artifact and deploys it.

When the deploy step finishes, open <https://wiki.tarun.win>.

---

## Day-to-day workflows

### Backend code change

```bash
cd backend
# edit app/...
sam build --use-container
sam deploy
```

Locally, uvicorn auto-reloads on save - no rebuild needed.

### Backend dependency change

```bash
cd backend
# edit requirements.txt
pip install -r requirements.txt  # local
# then redeploy
sam build --use-container
sam deploy
```

### Frontend code change (production)

```bash
git checkout dev
# edit src/...
git add -A && git commit -m "..."
git checkout main
git merge dev
git push origin main
```

The push triggers the GitHub Actions workflow.

### Frontend code change (local only)

```bash
cd frontend
npm start
# edit src/...
# browser hot-reloads
```

### Rotating the Confluence API token

1. Generate a new token at
   <https://id.atlassian.com/manage-profile/security/api-tokens>.
2. Revoke the old one.
3. Redeploy with the new value:

   ```bash
   cd backend
   sam deploy --parameter-overrides ConfluenceApiToken=<new-token>
   ```

4. Update `backend/.env` locally too.

### Rotating the registration password

```bash
cd backend
sam deploy --parameter-overrides RegistrationPassword=<new-password>
```

Update `backend/.env` for local dev. The Registration screen will prompt
again with the new password.

---

## Configuration reference

### Backend environment variables

Set in `backend/.env` for local dev, in the Lambda function's environment in
production.

| Variable                 | Required | Default          | Description                                     |
| ------------------------ | -------- | ---------------- | ----------------------------------------------- |
| `CONFLUENCE_BASE_URL`    | yes      |                  | `https://<site>.atlassian.net/wiki`             |
| `CONFLUENCE_EMAIL`       | yes      |                  | Atlassian account email                         |
| `CONFLUENCE_API_TOKEN`   | yes      |                  | API token from id.atlassian.com                 |
| `REGISTRATION_PASSWORD`  | yes      | `M@dhuri8797`    | Gates write endpoints                           |
| `CORS_ORIGINS`           | yes      | `http://localhost:4200` | Comma-separated allowed origins         |

### Frontend environments

| File                                 | Purpose                       | `apiBase`                            |
| ------------------------------------ | ----------------------------- | ------------------------------------ |
| `src/environments/environment.ts`    | Local dev (`ng serve`)        | `/api` (proxied to localhost:8000)   |
| `src/environments/environment.prod.ts` | Production build              | Rewritten by CI from `API_BASE_URL`  |

### GitHub repository configuration

| Setting                                                  | Value                                                  |
| -------------------------------------------------------- | ------------------------------------------------------ |
| Settings -> Pages -> Source                              | GitHub Actions                                         |
| Settings -> Pages -> Custom domain                       | `wiki.tarun.win`                                       |
| Settings -> Secrets and variables -> Variables -> `API_BASE_URL` | `https://<lambda-url>/api`                     |

---

## API reference

All endpoints are served under the Lambda Function URL. Reads are open; writes
require the `X-Registration-Password` header.

| Method | Path                              | Auth                       | Body                                  |
| ------ | --------------------------------- | -------------------------- | ------------------------------------- |
| GET    | `/api/health`                     | -                          |                                       |
| GET    | `/api/config`                     | -                          |                                       |
| POST   | `/api/auth/verify`                | -                          | `{password}`                          |
| GET    | `/api/spaces`                     | -                          |                                       |
| GET    | `/api/spaces/{id}/tree`           | -                          |                                       |
| GET    | `/api/pages/{id}`                 | -                          |                                       |
| POST   | `/api/spaces`                     | `X-Registration-Password`  | `{key, name, description?}`           |
| POST   | `/api/folders`                    | `X-Registration-Password`  | `{space_id, title, parent_id?}`       |
| POST   | `/api/pages`                      | `X-Registration-Password`  | `{space_id, title, body_html, parent_id?}` |

`GET /api/spaces/{id}/tree` returns a recursive `TreeNode`:

```json
{
  "id": "1001",
  "type": "space",
  "title": "Engineering",
  "space_id": "1001",
  "space_key": "ENG",
  "children": [
    { "id": "3001", "type": "folder", "title": "Architecture", "children": [...] },
    { "id": "2001", "type": "page",   "title": "Home",         "children": []  }
  ]
}
```

`GET /api/pages/{id}` returns the page metadata plus its body as HTML (the
Confluence "storage format", rendered with the Angular sanitizer):

```json
{
  "id": "2002",
  "title": "System Overview",
  "space_id": "1001",
  "body_html": "<h1>System Overview</h1><p>...</p>",
  "version": 4,
  "parent_id": "3001"
}
```

---

## Troubleshooting

### "Backend is not configured" banner appears
The Lambda env doesn't have `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, and
`CONFLUENCE_API_TOKEN`. Fix in the AWS console or redeploy with
`sam deploy --parameter-overrides ...`.

### `curl /api/config` works but the SPA shows network errors
CORS. The `CORS_ORIGINS` env var on the Lambda must include the origin you're
visiting from. Update it and redeploy.

### `sam deploy` fails with "ROLLBACK_COMPLETE state"
The stack is stuck because the first attempt failed. Delete it and start over:
```bash
sam delete --stack-name confluence-client-api
sam deploy --guided
```

### GitHub Actions fails on the build step
Open the failing run in the Actions tab. Common causes:
- `npm install` fails -> check the build log for a missing dependency.
- "API_BASE_URL repository variable is not set" warning -> you forgot Step 5.1.

### `wiki.tarun.win` shows GitHub's "404 - There isn't a GitHub Pages site here"
DNS hasn't propagated yet, or the CNAME points somewhere else.
```bash
dig wiki.tarun.win +short
```
Should resolve to `<user>.github.io` (CNAME) or one of the four
`185.199.10x.153` IPs (A records).

### `wiki.tarun.win` loads the app but routes like `/home` give a hard 404
The workflow should have created `404.html` (a copy of `index.html`). Confirm
the most recent deploy succeeded; the failing step is "Add SPA 404 fallback".

### Tailwind classes are missing / styles look broken
The PostCSS config file must be named `.postcssrc.json` or
`postcss.config.json`. Anything else (`postcss.config.js`, `.postcssrc.js`) is
silently ignored by `@angular/build`.

### Confluence creates fail with 401
The API token is wrong, or the email doesn't match the account that owns the
token.

### Confluence creates fail with 403
Your account doesn't have permission in the target space. For space creation
specifically you need Confluence site admin permission.

### Tail Lambda logs while reproducing an issue
```bash
sam logs -n ApiFunction --stack-name confluence-client-api --tail
```

### Tear down the AWS stack entirely
```bash
sam delete --stack-name confluence-client-api
```
