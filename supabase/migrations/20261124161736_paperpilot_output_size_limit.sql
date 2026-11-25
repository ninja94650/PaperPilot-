-- Reserve room for generated PDF revisions while API/worker enforce 20 MiB inputs and 40 MiB outputs.
update storage.buckets
set file_size_limit = 41943040
where id = 'documents' and file_size_limit < 41943040;
