import { useEffect } from 'react';

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K for search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        // TODO: integrate with search component
        // Trigger search modal - would integrate with a search component
      }

      // Cmd/Ctrl+N for new run
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        // TODO: integrate with new run modal
        // Trigger new run modal
      }

      // Escape to close modals
      if (e.key === 'Escape') {
        // Close any open modals
        // Close any open modals
        const modals = document.querySelectorAll('[role="dialog"]');
        modals.forEach((modal) => {
          if (modal instanceof HTMLElement) {
            modal.style.display = 'none';
          }
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
