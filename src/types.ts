export type User = {
  id: string
  name: string
  email: string
  color: string
  createdAt: number
  storageLimit: number
  isAdmin: boolean
}

export type AdminUser = User & {
  used: number
  items: number
  spaces: number
}

export type AdminSpace = {
  id: string
  kind: 'personal' | 'team'
  name: string
  owner_id: string
  owner: { name: string; email: string; color: string } | null
  members: number
  files: number
  size: number
  createdAt: number
}

export type Tag = { id: string; user_id: string; name: string; color: string }

export type Item = {
  id: string
  space_id: string
  owner_id: string
  parent_id: string | null
  kind: 'file' | 'folder'
  name: string
  mime: string
  size: number
  version: number
  starred: boolean
  description: string
  created_at: number
  updated_at: number
  deleted_at: number | null
  tags: Tag[]
  comments_count: number
  space_name?: string
}

export type Space = {
  id: string
  kind: 'personal' | 'team'
  name: string
  owner_id: string
  role: 'owner' | 'editor' | 'viewer'
  item_count?: number
  members?: number
  files?: number
}

export type Share = {
  id: string
  token: string
  url: string
  permission: 'view' | 'download' | 'comment'
  hasPassword: boolean
  expiresAt: number | null
  maxViews: number | null
  views: number
  maxDownloads: number | null
  downloads: number
  allowComments: boolean
  revoked: boolean
  createdAt: number
}

export type Comment = {
  id: string
  item_id: string
  user_id: string | null
  author_name: string
  author_color: string | null
  body: string
  created_at: number
}

export type Version = {
  id: string
  number: number
  size: number
  note: string
  created_at: number
  author?: string
}

export type AppNotification = {
  id: string
  user_id: string
  type: string
  message: string
  item_id: string | null
  created_at: number
  read: number
}

export type ActivityRow = {
  id: string
  user_id: string
  item_id: string | null
  action: string
  detail: string
  created_at: number
  user_name: string
}

export type PublicShare = {
  token: string
  permission: 'view' | 'download' | 'comment'
  passwordRequired: boolean
  expiresAt: number | null
  allowComments: boolean
  maxViews: number | null
  views: number
  maxDownloads: number | null
  downloads: number
  item: { id: string; name: string; kind: 'file' | 'folder'; mime: string; size: number; updatedAt: number }
  owner: { name: string; color: string } | null
}
