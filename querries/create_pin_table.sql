create table projects (
    id serial primary key,
    name text not null,
    description text,
    date_created timestamp default current_timestamp
);
create table threads (
    id serial primary key,
    project_id integer references projects(id),
    image_url text not null,    
    markup_id integer
);
create table pin (
    id serial primary key,
    x_cord integer not null,
    y_cord integer not null,
    comment_attatchment text,
    date_added timestamp default current_timestamp,
    thread_id integer references threads(id)
);

