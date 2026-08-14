export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Home: { dealId?: string; fromNotification?: boolean } | undefined;
  Filters: undefined;
  Notifications: undefined;
  Profile: undefined;
};

export type MainStackParamList = {
  Tabs: { screen?: keyof MainTabParamList } | undefined;
  DealDetail: { id: string; dealId?: string };
  AccountInfo: {
    fullName: string;
    phone: string;
    plan: import('./models').SubscriptionPlan;
  };
  NotificationPrefs: undefined;
  HelpSupport: undefined;
  About: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main:
    | {
        screen?: keyof MainStackParamList;
        params?: MainStackParamList[keyof MainStackParamList];
      }
    | undefined;
};
