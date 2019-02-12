CREATE TABLE ongaku (
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
