CREATE TABLE config (
  property varchar not null,
  value text not null,
  created_at timestamp,
  updated_at timestamp,
  deleted_at timestamp,
  PRIMARY KEY(property)
);

CREATE TABLE installations (
  version varchar not null,
  created_at timestamp,
  updated_at timestamp,
  deleted_at timestamp,
  PRIMARY KEY(version)
);

CREATE TABLE user_settings (
  property varchar not null,
  owner integer REFERENCES users(id),
  value varchar,
  created_at timestamp,
  updated_at timestamp,
  deleted_at timestamp,

  PRIMARY KEY (property, owner)
);