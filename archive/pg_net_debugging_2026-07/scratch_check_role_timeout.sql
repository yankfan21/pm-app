select rolname, rolconfig
from pg_roles
where rolname = current_user;
