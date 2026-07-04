import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RoleSelector } from '../../components/RoleSelector';
import { useRoleStore } from '../../store/roleStore';

// Mock the role store
vi.mock('../../store/roleStore', () => ({
  useRoleStore: vi.fn(),
}));

const mockSelectRole = vi.fn();
const mockSetAvailableRoles = vi.fn();

describe('RoleSelector Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementation
    vi.mocked(useRoleStore).mockReturnValue({
      availableRoles: [
        {
          id: '1',
          type: 'builder',
          name: 'Builder',
          description: 'Builds code',
          specialist: 'senior',
        } as any,
        {
          id: '2',
          type: 'critic',
          name: 'Critic',
          description: 'Reviews code',
          specialist: 'senior',
        } as any,
      ],
      selectedRoles: {
        builder: false,
        critic: false,
        judge: false,
        planner: false,
      },
      selectRole: mockSelectRole,
      setAvailableRoles: mockSetAvailableRoles,
      loading: false,
      clearSelection: vi.fn(),
      setLoading: vi.fn(),
      setError: vi.fn(),
      error: null,
    } as any);
  });

  it('should render role checkboxes', async () => {
    render(<RoleSelector />);

    await waitFor(() => {
      expect(screen.getByText('Builder')).toBeInTheDocument();
      expect(screen.getByText('Critic')).toBeInTheDocument();
    });
  });

  it('should select roles', async () => {
    render(<RoleSelector />);

    const builderCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(builderCheckbox);

    await waitFor(() => {
      expect(mockSelectRole).toHaveBeenCalled();
    });
  });

  it('should display loading state', () => {
    vi.mocked(useRoleStore).mockReturnValue({
      availableRoles: [],
      selectedRoles: {
        builder: false,
        critic: false,
        judge: false,
        planner: false,
      },
      selectRole: mockSelectRole,
      setAvailableRoles: mockSetAvailableRoles,
      loading: true,
      clearSelection: vi.fn(),
      setLoading: vi.fn(),
      setError: vi.fn(),
      error: null,
    } as any);

    render(<RoleSelector />);

    // Component should render without crashing when loading
    expect(screen.getByText(/agents|roles/i)).toBeInTheDocument();
  });

  it('should display role descriptions', () => {
    render(<RoleSelector />);

    expect(screen.getByText('Builds code')).toBeInTheDocument();
    expect(screen.getByText('Reviews code')).toBeInTheDocument();
  });
});
