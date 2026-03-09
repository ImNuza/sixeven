# SafeSeven

A personal finance management webapp built for the NTU FinTech Hackathon.

## Tech Stack

- **Client:** React 19, Vite, TailwindCSS, Recharts
- **Server:** Node.js, Express
- **Database:** PostgreSQL (production) or SQLite (local development)
- **Web3:** wagmi, viem (wallet integration)

## Prerequisites

- Node.js 18+ 
- npm or yarn
- (Optional) PostgreSQL 14+ for production database

## Installation

### 1. Clone and install dependencies

```bash
# Install client dependencies
cd client
npm install

# Install server dependencies  
cd ../server
npm install
```

### 2. Configure environment

Create a `.env` file in the `server/` directory:

```env
# Required: 48-byte hex string for JWT signing
AUTH_SECRET=your_48_byte_hex_string_here

# Optional: PostgreSQL connection (if not set, uses SQLite)
DATABASE_URL=postgresql://user:password@localhost:5432/safeseven

# Optional: Force SQLite even if DATABASE_URL is set
USE_SQLITE=true
```

Generate an AUTH_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Initialize the database

```bash
cd server
# For SQLite (default local setup)
USE_SQLITE=true node migrate.js

# For PostgreSQL
node migrate.js
```

## Running the App

### Local Development (SQLite)

```bash
# Terminal 1 - Start server
cd server
USE_SQLITE=true npm run dev

# Terminal 2 - Start client
cd client
npm run dev
```

### With PostgreSQL

```bash
# Terminal 1 - Start server
cd server
npm run dev

# Terminal 2 - Start client
cd client
npm run dev
```

Open http://localhost:5173 in your browser.

## Scripts

### Client
| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run test` | Run tests |

### Server
| Command | Description |
|---------|-------------|
| `npm run dev` | Start server |
| `npm run dev:watch` | Start with auto-reload |
| `npm run test` | Run unit tests |
| `npm run test:integration` | Run integration tests |

## Project Structure

```
sixeven/
├── client/          # React frontend
│   └── src/
│       ├── components/   # UI components
│       ├── pages/        # Route pages
│       ├── services/     # API client
│       └── context/      # React contexts
├── server/          # Express backend
│   ├── controllers/      # Route handlers
│   ├── services/         # Business logic
│   ├── db/               # Database schemas
│   └── middleware/       # Auth, validation
└── shared/          # Shared constants
```

## License

See [LICENSE](LICENSE) for details.
