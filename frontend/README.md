# Lunaris Frontend

Next.js web application for the Lunaris cloud gaming platform.

## Architecture

This is a Next.js application built with:

- **Next.js 15** with App Router
- **React 19** for UI components
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **Radix UI** for accessible UI components
- **Turbopack** for fast development builds

## Project Structure

**As the project evolves, please make sure to add to this documentation!**

```
frontend/
├── app/                    # Next.js App Router pages
│   ├── about/             # About page
│   ├── browse/            # Game browsing page
│   ├── login/             # Authentication page
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout component
│   └── page.tsx           # Home page
├── components/            # Reusable React components
│   ├── ui/               # Base UI components (buttons, inputs, etc.)
│   ├── dashboard.tsx     # Dashboard component
│   └── login-form.tsx    # Login form component
├── context/              # React context providers
│   └── usercontext.tsx   # User authentication context
├── lib/                  # Utility functions
│   └── utils.ts          # Common utilities
└── public/               # Static assets
```

## Development Workflow

### Prerequisites

- Node.js 18+
- npm or yarn package manager

### Setup

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

### Development Guidelines

1. **Component Organization**: Place reusable components in `components/` directory
2. **Page Structure**: Use Next.js App Router in `app/` directory
3. **Styling**: Use Tailwind CSS classes for styling
4. **Type Safety**: Ensure all components are properly typed with TypeScript
5. **Code Quality**: Run `npm run lint` and `npm run type-check` before committing

### Available Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build production application
- `npm run start` - Start production server
- `npm run lint` - Run ESLint checks
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run type-check` - Run TypeScript type checking
- `npm run clean` - Clean build artifacts

### Building for Production

```bash
npm run build
npm run start
```

## References

- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Radix UI Documentation](https://www.radix-ui.com/docs)
