import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../../components/ErrorBoundary';

// Error component for testing
function ErrorComponent(): React.ReactElement {
  throw new Error('Test error');
}

function NormalComponent() {
  return <div>Normal Content</div>;
}

describe('ErrorBoundary Component', () => {
  it('should catch component errors', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ErrorComponent />
      </ErrorBoundary>
    );

    // Error boundary should display error UI
    expect(screen.getByText(/went wrong/i)).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('should render children normally when no error', () => {
    render(
      <ErrorBoundary>
        <NormalComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Normal Content')).toBeInTheDocument();
  });

  it('should display error message', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ErrorComponent />
      </ErrorBoundary>
    );

    // Should show some error message
    const errorElements = screen.queryAllByText(/error|went wrong/i);
    expect(errorElements.length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
  });
});
