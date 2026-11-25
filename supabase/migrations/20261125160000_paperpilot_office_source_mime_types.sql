-- Allow the native Office source formats supported by Word and Presentation Studio.
-- The editor's immutable cloud revisions are normalized to DOCX/PPTX, while the original
-- upload retains its original format and remains available in the private library.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime_type order by mime_type)
  from unnest(coalesce(allowed_mime_types, array[]::text[]) || array[
    'application/rtf',
    'text/rtf',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.presentation'
  ]::text[]) as mime_type
)
where id = 'documents';
