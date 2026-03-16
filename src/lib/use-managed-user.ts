'use client';

import { useSearchParams } from 'next/navigation';

export function useManagedUser() {
  const searchParams = useSearchParams();
  return searchParams.get('managedUser') || null;
}
