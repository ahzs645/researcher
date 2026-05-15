import { BaseThemeProvider } from '@/ui/theme/components/BaseThemeProvider';

export const ConvexBridgeConfigError = () => (
  <BaseThemeProvider>
    <main
      style={{
        alignItems: 'center',
        display: 'flex',
        minHeight: '100vh',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <section
        style={{
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          maxWidth: 520,
          padding: 24,
        }}
      >
        <p
          style={{
            color: 'var(--text-color-tertiary)',
            fontSize: 12,
            fontWeight: 600,
            margin: 0,
            textTransform: 'uppercase',
          }}
        >
          Convex data mode
        </p>
        <h1
          style={{
            color: 'var(--text-color)',
            fontSize: 24,
            margin: '8px 0',
          }}
        >
          Convex URL required
        </h1>
        <p
          style={{
            color: 'var(--text-color-secondary)',
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          Set <code>REACT_APP_CONVEX_URL</code> to your Convex deployment URL to
          run the Twenty bridge against the live Convex backend.
        </p>
      </section>
    </main>
  </BaseThemeProvider>
);
