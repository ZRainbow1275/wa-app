import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router';
import type { LongConnectionState } from '../proto/byte/v/forge/waapp/v1/messaging';
import type { WAAccount } from '../proto/byte/v/forge/waapp/v1/profile';
import { deleteWaMessagesForMe, getWaAccountOtpMessages, getWaContacts, getWaMessages, markWaMessagesRead, waAccountID, waKeys } from './wa-api';
import { useWaContactAutoResolve } from './wa-contact-resolve';
import { buildWaChatEvents, buildWaContacts, filterWaEvents } from './wa-chat-model';
import { WaChatThread } from './wa-chat-thread';
import { WaContactList } from './wa-contact-list';
import { waContactPath } from './wa-route-paths';

export function WaInbox({ account, connection, contactID }: { account: WAAccount; connection?: LongConnectionState; contactID: string }) {
  const accountID = waAccountID(account);
  const queryClient = useQueryClient();
  const messagesQuery = useQuery({ queryKey: waKeys.messages(accountID), queryFn: () => getWaMessages(accountID), enabled: Boolean(accountID), refetchInterval: 8000 });
  const otpQuery = useQuery({ queryKey: waKeys.otpMessages(accountID), queryFn: () => getWaAccountOtpMessages(accountID), enabled: Boolean(accountID), refetchInterval: 10000 });
  const contactsQuery = useQuery({ queryKey: waKeys.contacts(accountID), queryFn: () => getWaContacts(accountID), enabled: Boolean(accountID), refetchInterval: 30000 });
  useWaContactAutoResolve(accountID, contactsQuery.data?.contacts || []);
  const events = useMemo(() => buildWaChatEvents(messagesQuery.data?.messages || [], otpQuery.data?.otp_messages || []), [messagesQuery.data?.messages, otpQuery.data?.otp_messages]);
  const contacts = useMemo(() => buildWaContacts(events, contactsQuery.data?.contacts || []), [events, contactsQuery.data?.contacts]);
  const activeContactID = contacts.some((contact) => contact.id === contactID) ? contactID : contacts[0]?.id || '';
  const activeContact = contacts.find((contact) => contact.id === activeContactID);
  const threadEvents = useMemo(() => filterWaEvents(events, activeContactID), [events, activeContactID]);
  const refreshMessageViews = async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: waKeys.messages(accountID) }), queryClient.invalidateQueries({ queryKey: waKeys.contacts(accountID) })]);
  };
  const markReadMutation = useMutation({
    mutationFn: async (messageIDs: string[]) => {
      const resp = await markWaMessagesRead(accountID, messageIDs);
      if (resp.error?.message) throw new Error(resp.error.message);
      return resp;
    },
    onSettled: refreshMessageViews,
  });
  const deleteMutation = useMutation({
    mutationFn: async (messageID: string) => {
      const resp = await deleteWaMessagesForMe(accountID, [messageID]);
      if (resp.error?.message) throw new Error(resp.error.message);
      return resp;
    },
    onSettled: refreshMessageViews,
  });
  const error = messagesQuery.data?.error?.message || otpQuery.data?.error?.message || contactsQuery.data?.error?.message || mutationError(markReadMutation.error) || mutationError(deleteMutation.error);
  if (activeContactID && activeContactID !== contactID) return <Navigate to={waContactPath(accountID, activeContactID)} replace />;
  return (
    <section className="grid h-dvh min-h-0 md:grid-cols-[320px_minmax(0,1fr)]">
      <WaContactList accountID={accountID} contacts={contacts} selectedID={activeContactID} loading={messagesQuery.isLoading || otpQuery.isLoading || contactsQuery.isLoading} error={error} />
      <WaChatThread account={account} connection={connection} contact={activeContact} events={threadEvents} loading={messagesQuery.isFetching || otpQuery.isFetching || contactsQuery.isFetching} error={error} actionBusy={markReadMutation.isPending || deleteMutation.isPending} onMarkRead={() => markThreadRead(threadEvents, markReadMutation.mutate)} onDeleteMessage={(messageID) => deleteMessageForMe(messageID, deleteMutation.mutate)} />
    </section>
  );
}

function markThreadRead(events: ReturnType<typeof filterWaEvents>, mutate: (messageIDs: string[]) => void) {
  const ids = events.filter((event) => !event.outgoing && !event.read).map((event) => event.id);
  if (ids.length > 0) mutate(ids);
}

function deleteMessageForMe(messageID: string, mutate: (messageID: string) => void) {
  if (!messageID) return;
  if (window.confirm('删除这条消息？')) mutate(messageID);
}

function mutationError(error: unknown) {
  return error instanceof Error ? error.message : '';
}
