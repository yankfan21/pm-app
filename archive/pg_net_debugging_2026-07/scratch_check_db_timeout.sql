select d.datname, r.rolname, s.setconfig
from pg_db_role_setting s
left join pg_database d on d.oid = s.setdatabase
left join pg_roles r on r.oid = s.setrole;
