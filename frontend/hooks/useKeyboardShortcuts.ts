import { useEffect } from 'react';

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K for search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        console.log('Open search (CMD+K)');
        // Trigger search modal - would integrate with a search component
      }

      // Cmd/Ctrl+N for new run
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        console.log('New run (CMD+N)');
        // Trigger new run modal
      }

      // Escape to close modals
      if (e.key === 'Escape') {
        console.log('Close modal (ESC)');
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
