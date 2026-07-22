import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const apiSource = read('../src/qairaApi.js');
const accessSource = read('../src/qairaAccess.js');
const clientSource = read('../static/qaira-ui/src/lib/api.ts');
const pageSource = read('../static/qaira-ui/src/pages/NotificationsPage.tsx');
const shellSource = read('../static/qaira-ui/src/components/AppShell.tsx');
const stylesSource = read('../static/qaira-ui/src/styles.css');

const functionSource = (name, nextName) => apiSource.match(
  new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}\\n\\n(?:async )?function ${nextName}`)
)?.[0] || '';

test('notification keys, reads, and mutations are scoped to the exact project account', () => {
  const handler = functionSource('handleNotifications', 'handleAppTypes');
  const pager = functionSource('listAppNotificationPage', 'moveNotificationEntriesToRead');
  const keyParser = functionSource('parseNotificationItemPropertyKey', 'notificationTombstonePropertyKey');
  const scoper = functionSource('scopedNotificationEntries', 'notificationUnreadSummary');

  assert.match(handler, /const project = context\?\.qairaAuthorization\?\.project/);
  assert.match(handler, /const accountId = \(await currentActor\(context, project, 'notifications'\)\)\.accountId/);
  assert.match(handler, /const isMine = \(item\) => Boolean\(item\?\.user_id\) && String\(item\.user_id\) === String\(accountId\)/);
  assert.match(apiSource, /function notificationItemPropertyKey\(userId, status, createdAt, preference, notificationId\)/);
  assert.match(apiSource, /`\$\{NOTIFICATION_V2_ITEM_PREFIX\}\$\{safePropertyToken\(userId\)\}\.\$\{statusToken\}\.\$\{notificationTimestampToken\(createdAt\)\}\.\$\{preferenceToken\}\.\$\{safePropertyToken\(notificationId\)\}`/);
  assert.match(keyParser, /tokens\.length !== 5/);
  assert.match(scoper, /entry\?\.userToken === userToken/);
  assert.match(scoper, /notificationGuardState\(propertyKeys, userToken\)/);
  assert.match(pager, /listProjectPropertyKeys\(project\.key\)/);
  assert.match(pager, /scopedNotificationEntries\(propertyKeys, accountId, \{ status: requestedStatus \}\)/);
  assert.match(pager, /const pageEntries = remainingEntries\.slice\(0, limit\)/);
  assert.match(pager, /loadNotificationEntries\(project, accountId, pageEntries\)/);
  assert.match(pageSource, /const notificationScope = projectId \|\| "workspace"/);
  assert.match(pageSource, /\["notifications", "feed", notificationScope\]/);
  assert.match(pageSource, /\["notifications", "unread", notificationScope\]/);
  assert.match(shellSource, /\["notifications", "unread", sidebarProjectId \|\| "workspace"\]/);
});

test('notification storage is indexless and each request has a bounded Forge property cost', () => {
  const creator = functionSource('createAppNotification', 'safelyCreateAppNotification');
  const pager = functionSource('listAppNotificationPage', 'moveNotificationEntriesToRead');
  const migration = functionSource('migrateLegacyNotificationBatch', 'pruneNotificationKeyspace');
  const deleteBatch = functionSource('notificationDeleteBatch', 'recordMutationNotifications');
  const handler = functionSource('handleNotifications', 'handleAppTypes');
  const unreadHandler = handler.match(/if \(pathname === '\/notifications\/unread-count'[\s\S]*?\n  }\n  if \(pathname === '\/notifications' && method === 'GET'\)/)?.[0] || '';
  const deleteAllHandler = handler.match(/if \(pathname === '\/notifications' && method === 'DELETE'\)[\s\S]*?\n  }\n  return null;/)?.[0] || '';

  assert.match(apiSource, /NOTIFICATION_PAGE_SIZE = 25/);
  assert.match(apiSource, /NOTIFICATION_MAX_PAGE_SIZE = 50/);
  assert.match(apiSource, /NOTIFICATION_DELETE_BATCH_SIZE = 25/);
  assert.match(apiSource, /NOTIFICATION_MARK_READ_BATCH_SIZE = 10/);
  assert.match(apiSource, /NOTIFICATION_LEGACY_MIGRATION_BATCH_SIZE = 5/);
  assert.match(creator, /notificationItemPropertyKey\(userId, 'unread'/);
  assert.match(creator, /putProjectProperty\(project\.key, propertyKey, notificationEnvelope/);
  assert.match(creator, /listProjectPropertyKeysFresh\(project\.key\)/);
  assert.match(creator, /pruneNotificationKeyspace\(project\.key, userId, propertyKeys\)/);
  assert.doesNotMatch(creator, /upsertCollectionItem|itemKeys:|collectionKey\(COLLECTIONS\.notifications\)/);

  assert.match(pager, /const limit = clamp\(Number\(query\.limit\) \|\| NOTIFICATION_PAGE_SIZE, 1, NOTIFICATION_MAX_PAGE_SIZE\)/);
  assert.match(pager, /const pageEntries = remainingEntries\.slice\(0, limit\)/);
  assert.match(pager, /const items = await loadNotificationEntries\(project, accountId, pageEntries\)/);
  assert.match(pager, /next_cursor: hasMore && pageEntries\.length/);
  assert.match(pager, /migrateLegacyNotificationBatch\(project, propertyKeys\)/);
  assert.match(migration, /slice\(0, NOTIFICATION_LEGACY_MIGRATION_BATCH_SIZE\)/);
  assert.match(migration, /readPropertiesInBatches\(project\.key, legacyKeys, NOTIFICATION_LEGACY_MIGRATION_BATCH_SIZE\)/);

  assert.match(unreadHandler, /listProjectPropertyKeys\(project\.key\)/);
  assert.match(unreadHandler, /notificationUnreadSummary\(propertyKeys, accountId\)/);
  assert.doesNotMatch(unreadHandler, /readPropertiesInBatches|loadNotificationEntries|getCollection/);
  assert.match(deleteAllHandler, /putProjectProperty\(project\.key, cutoffKey/);
  assert.match(deleteAllHandler, /listProjectPropertyKeysFresh\(project\.key\)/);
  assert.match(deleteAllHandler, /notificationDeleteBatch\(propertyKeys, accountId, beforeTime\)/);
  assert.match(deleteAllHandler, /deleteNotificationKeys\(project\.key, batch\.propertyKeys\)/);
  assert.doesNotMatch(deleteAllHandler, /readPropertiesInBatches|loadNotificationEntries|getCollection/);
  assert.match(deleteBatch, /NOTIFICATION_DELETE_BATCH_SIZE - propertyCount/);
  assert.match(deleteBatch, /propertyKeys: selected\.flatMap/);

  assert.match(clientSource, /notifications: \{[\s\S]*list: \(query\?: \{ status\?:/);
  assert.match(clientSource, /PagedResult<AppNotification> & \{ unread_count: number \}/);
  assert.match(clientSource, /unreadCount: \(\) =>[\s\S]*"\/notifications\/unread-count"/);
  assert.match(clientSource, /for \(let batch = 0; batch < 10 && hasMore; batch \+= 1\)/);
  assert.match(clientSource, /JSON\.stringify\(before \? \{ before \} : \{\}\)/);
  assert.match(clientSource, /before = result\.before/);
  assert.match(clientSource, /if \(stalledBatches >= 2\) break/);
});

test('notification UX paginates only with a verified cursor and refreshes only the first page', () => {
  assert.match(accessSource, /notification\.manage', 'Mark read and delete personal notifications\.'/);
  assert.match(pageSource, /hasPermission\(session, "notification\.manage"\)/);
  assert.match(pageSource, /useInfiniteQuery\(\{/);
  assert.match(pageSource, /normalizePagedResult<AppNotification>\(response\)/);
  assert.match(pageSource, /getNextPageParam:[\s\S]*getVerifiedNextPageCursor\(lastPage\)[\s\S]*!allPageParams\.includes\(nextCursor\)/);
  assert.match(pageSource, /serverNotificationsQuery\.hasNextPage/);
  assert.match(pageSource, /<HierarchyLoadMoreButton/);
  assert.match(pageSource, /isLoading=\{serverNotificationsQuery\.isFetchingNextPage\}/);
  assert.match(pageSource, /queryClient\.resetQueries\(\{ queryKey: notificationQueryKey, exact: true \}\)/);
  assert.match(pageSource, /window\.setInterval\([\s\S]*300_000/);
  assert.doesNotMatch(pageSource, /refetchInterval:/);
  assert.doesNotMatch(pageSource, /serverNotificationsQuery\.refetch\(\)/);
  assert.match(pageSource, /confirmDelete\(\{[\s\S]*Delete notification\?/);
  assert.match(pageSource, /confirmDelete\(\{[\s\S]*Delete all notifications\?/);
  assert.match(pageSource, /aria-label=\{`Delete notification:/);
  assert.match(pageSource, /notification-action-spinner/);
  assert.match(pageSource, /const operationLockRef = useRef\(false\)/);
  assert.match(pageSource, /serverNotificationsQuery\.isPending[\s\S]*LoadingState/);
  assert.match(pageSource, /serverNotificationsQuery\.isError[\s\S]*Retry/);
  assert.match(pageSource, /inline-message error-message/);
  assert.match(stylesSource, /\.notification-open-button[\s\S]*\.notification-delete-button/);

  assert.match(shellSource, /queryFn: api\.notifications\.unreadCount/);
  assert.doesNotMatch(shellSource, /api\.notifications\.list\(\{\s*status:\s*["']unread["']/);
  assert.match(shellSource, /refetchInterval: 300_000/);
  assert.match(shellSource, /realtime\.subscribeGlobal[\s\S]*queryClient\.resetQueries\(\{ queryKey: \["notifications", "feed"/);
  assert.match(shellSource, /realtime\.subscribeGlobal[\s\S]*queryClient\.invalidateQueries\(\{ queryKey: \["notifications", "unread"/);
});

test('unique key guards prevent concurrent reads from resurrecting deleted notifications', () => {
  const creator = functionSource('createAppNotification', 'safelyCreateAppNotification');
  const mover = functionSource('moveNotificationEntriesToRead', 'notificationEntriesForId');
  const pruner = functionSource('pruneNotificationKeyspace', 'loadLegacyNotification');
  const handler = functionSource('handleNotifications', 'handleAppTypes');
  const deleteOneHandler = handler.match(/const deleteMatch = pathname\.match[\s\S]*?\n  if \(pathname === '\/notifications' && method === 'DELETE'\)/)?.[0] || '';
  const deleteAllHandler = handler.match(/if \(pathname === '\/notifications' && method === 'DELETE'\)[\s\S]*?\n  }\n  return null;/)?.[0] || '';

  assert.match(apiSource, /NOTIFICATION_V2_TOMBSTONE_PREFIX/);
  assert.match(apiSource, /NOTIFICATION_V2_CUTOFF_PREFIX/);
  assert.match(apiSource, /NOTIFICATION_CUTOFF_CLOCK_SKEW_MS = 30_000/);
  assert.match(apiSource, /function notificationTombstonePropertyKey/);
  assert.match(apiSource, /function notificationCutoffPropertyKey/);
  assert.match(apiSource, /function notificationGuardState/);
  assert.match(apiSource, /async function withNotificationMutationLock/);
  assert.match(handler, /withNotificationMutationLock\(project\.key, accountId/);

  assert.match(deleteOneHandler, /const tombstoneKey = notificationTombstonePropertyKey/);
  assert.match(deleteOneHandler, /await putProjectProperty\(project\.key, tombstoneKey/);
  assert.match(deleteOneHandler, /await deleteNotificationKeys\(project\.key, targets\)/);
  assert.ok(deleteOneHandler.indexOf('putProjectProperty(project.key, tombstoneKey') < deleteOneHandler.indexOf('deleteNotificationKeys(project.key, targets'));
  assert.match(deleteAllHandler, /const cutoffKey = notificationCutoffPropertyKey/);
  assert.match(deleteAllHandler, /beforeTime > Date\.now\(\) \+ NOTIFICATION_CUTOFF_CLOCK_SKEW_MS/);
  assert.match(deleteAllHandler, /if \(suppliedBefore\)[\s\S]*listProjectPropertyKeysFresh\(project\.key\)[\s\S]*propertyKeys\.includes\(cutoffKey\)/);
  assert.match(deleteAllHandler, /else \{[\s\S]*putProjectProperty\(project\.key, cutoffKey[\s\S]*listProjectPropertyKeysFresh\(project\.key\)/);

  assert.match(creator, /const propertyEntry = parseNotificationItemPropertyKey\(propertyKey\)/);
  assert.match(creator, /notificationEntryIsGuarded\(propertyEntry, guardState\)/);
  assert.match(creator, /await deleteProjectProperty\(project\.key, propertyKey\);\s*return null/);
  assert.match(creator, /if \(!notification\) return null;[\s\S]*publishGlobal/);

  assert.match(mover, /const writeResults = await settleInBatches/);
  assert.match(mover, /const postWriteKeys = await listProjectPropertyKeysFresh\(project\.key\)/);
  assert.match(mover, /const postWriteGuard = notificationGuardState/);
  assert.match(mover, /notificationEntryIsGuarded\(candidate\.entry, postWriteGuard\)/);
  assert.match(mover, /\[\.\.\.new Set\(\[candidate\.entry\.key, candidate\.readKey\]\)\]/);
  assert.match(pruner, /rawItemEntries/);
  assert.match(pruner, /staleIdTokens/);
  assert.match(pruner, /entry\.idToken === guard\.idToken/);
  assert.match(pruner, /entry\.createdTime <= guard\.cutoffTime/);
  assert.doesNotMatch(handler, /extendNotificationDeleteGuard|readNotificationDeleteGuard/);
});

test('legacy notification migration is lazy, bounded, and removes old shards only after v2 persistence', () => {
  const migration = functionSource('migrateLegacyNotificationBatch', 'pruneNotificationKeyspace');

  assert.match(migration, /startsWith\(collectionItemPrefix\(COLLECTIONS\.notifications\)\)/);
  assert.match(migration, /slice\(0, NOTIFICATION_LEGACY_MIGRATION_BATCH_SIZE\)/);
  assert.match(migration, /await putProjectProperty\(project\.key, candidate\.v2Key/);
  assert.match(migration, /await deleteProjectProperty\(project\.key, candidate\.legacyKey\)/);
  assert.ok(migration.indexOf('putProjectProperty(project.key, candidate.v2Key') < migration.indexOf('deleteProjectProperty(project.key, candidate.legacyKey'));
  assert.match(migration, /`\$\{entry\.userToken\}\.\$\{entry\.idToken\}`/);
  assert.match(migration, /scopedIdToken/);
  assert.doesNotMatch(migration, /itemKeys:|collectionKey\(COLLECTIONS\.notifications\)/);
});

test('Jira project property key scans follow the exhaustive non-paginated PropertyKeys contract', () => {
  const cachedLister = functionSource('listProjectPropertyKeys', 'listProjectPropertyKeysFresh');
  const freshLister = functionSource('listProjectPropertyKeysFresh', 'getCollectionIndex');

  assert.match(cachedLister, /returns all keys in one response/);
  assert.match(cachedLister, /jiraAppRequest\(route`\/rest\/api\/3\/project\/\$\{projectKey\}\/properties`\)/);
  assert.doesNotMatch(cachedLister, /properties\?/);
  assert.match(freshLister, /exhaustive, non-paginated PropertyKeys contract/);
  assert.doesNotMatch(freshLister, /properties\?/);
});
