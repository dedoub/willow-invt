export const en = {
  // Common
  common: {
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    search: 'Search',
    logout: 'Logout',
    profile: 'Profile',
    settings: 'Settings',
  },

  // Auth
  auth: {
    login: {
      title: 'Welcome back',
      subtitle: 'Sign in to your account',
      email: 'Email',
      emailPlaceholder: 'name@example.com',
      password: 'Password',
      passwordPlaceholder: 'Enter your password',
      submit: 'Sign in',
      submitting: 'Signing in...',
      noAccount: "Don't have an account?",
      signup: 'Sign up',
      error: 'Login failed',
      contactInfo: 'Contact',
    },
    signup: {
      title: 'Create account',
      subtitle: 'Sign up for Willow Dashboard',
      name: 'Full Name',
      namePlaceholder: 'John Doe',
      email: 'Email',
      emailPlaceholder: 'name@example.com',
      password: 'Password',
      passwordPlaceholder: 'At least 8 characters',
      confirmPassword: 'Confirm Password',
      confirmPasswordPlaceholder: 'Confirm your password',
      signupCode: 'Signup Code',
      signupCodePlaceholder: 'Enter signup code',
      signupCodeRequired: 'Signup code is required',
      submit: 'Create account',
      submitting: 'Creating account...',
      hasAccount: 'Already have an account?',
      login: 'Sign in',
      passwordMismatch: 'Passwords do not match',
      passwordTooShort: 'Password must be at least 8 characters',
      error: 'Signup failed',
    },
  },

  // Brand
  brand: {
    name: 'Willow Investments',
    tagline: 'Manage your projects and team efficiently',
  },

  // Sidebar
  sidebar: {
    dashboard: 'Dashboard',
    projects: 'Projects',
    users: 'Users',
    settings: 'Settings',
    version: 'Willow Dashboard v1.0',
  },

  // Header
  header: {
    language: 'Language',
    searchPlaceholder: 'Search...',
  },

  // Dashboard
  dashboard: {
    title: 'Dashboard',
    welcome: 'Welcome',
    welcomeDesc: 'Manage your projects and team',
    totalProjects: 'Total Projects',
    activeProjects: 'Active',
    completedProjects: 'Completed',
    totalUsers: 'Total Users',
    recentProjects: 'Recent Projects',
    quickActions: 'Quick Actions',
  },

  // Projects
  projects: {
    title: 'Projects',
    description: 'Manage your projects',
    new: 'New Project',
    noData: 'No projects found',
    status: {
      active: 'Active',
      completed: 'Completed',
      onHold: 'On Hold',
      cancelled: 'Cancelled',
    },
    columns: {
      name: 'Name',
      status: 'Status',
      owner: 'Owner',
      created: 'Created',
      actions: 'Actions',
    },
  },

  // Users
  users: {
    title: 'Users',
    description: 'Manage users',
    new: 'New User',
    noData: 'No users found',
    roles: {
      admin: 'Admin',
      editor: 'Editor',
      viewer: 'Viewer',
    },
    columns: {
      name: 'Name',
      email: 'Email',
      role: 'Role',
      lastLogin: 'Last Login',
      actions: 'Actions',
    },
  },

  // Settings
  settings: {
    title: 'Settings',
    description: 'Manage system settings',
    general: 'General',
    language: 'Language',
    theme: 'Theme',
  },
} as const
