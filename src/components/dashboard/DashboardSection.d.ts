import type { ReactNode } from 'react';

export interface DashboardSectionProps {
  id?: string;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

declare const DashboardSection: (props: DashboardSectionProps) => JSX.Element;
export default DashboardSection;
