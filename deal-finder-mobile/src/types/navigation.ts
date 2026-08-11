export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Home: { dealId?: string; fromNotification?: boolean } | undefined;
  Filters: undefined;
  Profile: undefined;
};

export type MainStackParamList = {
  Tabs: undefined;
  DealDetail: { id: string; dealId?: string };
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
