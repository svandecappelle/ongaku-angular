CREATE TABLE groups (
  id serial PRIMARY KEY,
  name varchar NOT NULL,
	created_at timestamp,
	updated_at timestamp,
	deleted_at timestamp
);
CREATE TABLE user_groups (
  group_id int REFERENCES groups(id),
  user_id int REFERENCES users(id),
  created_at timestamp,
  updated_at timestamp,
  deleted_at timestamp,
  CONSTRAINT user_groups_pkey PRIMARY KEY (group_id , user_id) 
);