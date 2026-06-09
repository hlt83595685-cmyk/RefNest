export interface Item {
  id: number
  key: string
  type: string
  title: string | null
  abstract: string | null
  year: number | null
  doi: string | null
  url: string | null
  library_id: number
  created_at: number
  updated_at: number
  version: number
}

export type ItemType =
  | 'journalArticle'
  | 'book'
  | 'bookSection'
  | 'thesis'
  | 'conferencePaper'
  | 'report'
  | 'webpage'
  | 'preprint'

export interface Creator {
  id: number
  first_name: string | null
  last_name: string
  orcid: string | null
  role: 'author' | 'editor' | 'translator'
  position: number
}

export interface Collection {
  id: number
  library_id: number
  parent_id: number | null
  name: string
  key: string
}

export interface Tag {
  id: number
  name: string
}
