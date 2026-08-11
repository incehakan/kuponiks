import {
  createNavigationContainerRef,
  CommonActions,
} from '@react-navigation/native';

import type { RootStackParamList } from '../types/navigation';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Navigates to in-app DealDetail from a push notification.
 * Never opens an external browser/URL from the notification tap.
 */
export function navigateToDealFromNotification(dealId?: string): void {
  const id = dealId?.trim();
  if (!id) {
    return;
  }

  const tryNavigate = (attempt = 0): void => {
    if (!navigationRef.isReady()) {
      if (attempt < 20) {
        setTimeout(() => tryNavigate(attempt + 1), 100);
      }
      return;
    }

    // Root → Main stack → DealDetail
    navigationRef.dispatch(
      CommonActions.navigate({
        name: 'Main',
        params: {
          screen: 'DealDetail',
          params: { id, dealId: id },
        },
      }),
    );
  };

  tryNavigate();
}
