CREATE OR REPLACE TABLE installations (
  version varchar not null,
  created_at timestamp,
  updated_at timestamp,
  deleted_at timestamp,
  PRIMARY KEY(version),

  CONSTRAINT version_semver_contraint CHECK (version ~* '^(v?([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})\-?(.*)?)$')
)
WITH (
  OIDS=FALSE
) ;
