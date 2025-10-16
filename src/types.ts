// src/types.ts

export interface UserType {
  id: string;
  uid: string;
  username: string;
  avatar: string;
  email?: string;
  role?: string;
}

export interface Group {
  id: string;
  name: string;
  members: string[];
  avatar?: string;
}
