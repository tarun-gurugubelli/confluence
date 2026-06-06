# Confluence Client - Backend

FastAPI service that proxies the Angular frontend to Confluence Cloud. Runs
under `uvicorn` locally and packaged for **AWS Lambda** (via Mangum) in
production.

## Layout

```
backend/
├── app/
│   ├── auth.py            # X-Registration-Password gate for write endpoints
│   ├── config.py          # Settings loaded from environment / .env
│   ├── confluence_client.py
│   ├── main.py            # FastAPI app + Mangum Lambda handler
│   ├── models.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── content.py
│   │   └── spaces.py
│   └── service.py
├── requirements.txt
├── template.yaml          # AWS SAM template (Lambda + Function URL)
├── samconfig.toml         # SAM CLI defaults (stack name, region)
└── .env.example
```

## Local development

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Confluence base URL, email, and API token, plus the
# registration password (defaults to M@dhuri8797).
uvicorn app.main:app --reload --port 8000
```

If the Confluence credentials are not set, reads return `503` until they are.

## Deploy to AWS Lambda (SAM)

Prerequisites: AWS CLI configured (`aws configure`), recent
[AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html),
Docker installed (for the `--use-container` build that produces a
linux-compatible package even when you're on macOS).

```bash
cd backend
sam build --use-container
sam deploy --guided
```

On the first guided run, SAM asks for parameters (`ConfluenceBaseUrl`,
`ConfluenceEmail`, `ConfluenceApiToken`, `RegistrationPassword`,
`CorsOrigins`) and saves them in `samconfig.toml`. Subsequent deploys are just:

```bash
sam build --use-container && sam deploy
```

After a successful deploy the `ApiUrl` output is the Function URL, e.g.
`https://abc123xyz.lambda-url.us-east-1.on.aws/`. Save that &mdash; you'll
paste it (with `/api` suffix) into the GitHub repo variable `API_BASE_URL` so
the frontend workflow can wire it into the production build.

### Updating credentials later

Either re-run `sam deploy` and supply the new values, or update the Lambda
function's environment variables in the AWS console:

```
CONFLUENCE_BASE_URL
CONFLUENCE_EMAIL
CONFLUENCE_API_TOKEN
REGISTRATION_PASSWORD
CORS_ORIGINS
```

## Endpoints

| Method | Path                              | Auth                       |
| ------ | --------------------------------- | -------------------------- |
| GET    | `/api/health`                     | -                          |
| GET    | `/api/config`                     | -                          |
| POST   | `/api/auth/verify`                | -                          |
| GET    | `/api/spaces`                     | -                          |
| GET    | `/api/spaces/{id}/tree`           | -                          |
| GET    | `/api/pages/{id}`                 | -                          |
| POST   | `/api/spaces`                     | `X-Registration-Password`  |
| POST   | `/api/folders`                    | `X-Registration-Password`  |
| POST   | `/api/pages`                      | `X-Registration-Password`  |
