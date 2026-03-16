'use client';

import { Suspense } from 'react';
import EventTypeEditor from '@/components/event-type-editor/EventTypeEditor';
import { useManagedUser } from '@/lib/use-managed-user';

function NewEventTypeContent() {
  const managedUserId = useManagedUser();
  return <EventTypeEditor mode="create" managedUserId={managedUserId} />;
}

export default function NewEventTypePage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">読み込み中...</div>}>
      <NewEventTypeContent />
    </Suspense>
  );
}
