we are a prop-tech company and we want to build and annotation tool 
that helps us leave comment on images of architectural renders our clients need to directly have access to the comments . upload photo for render and annotations 
### users
-   admin(stephan, me)
-   pm(vivien, sonia, aliyu)
-   studio() 
-   client
### comment(pins)
- x-cord
- y-cord
- comment-attatchment
- date-added
- thread(image)_id
- author
- status(resolved, active, deleted)
### threads(images)
- id
- project_id
- image_url
- markup_id
- comments: array[comment-id]
- 
### projects
- suppliers [user_type_supplier_ids]
- cliet [user_type_cliet_id]
- CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(200) UNIQUE NOT NULL,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'pm', 'supplier', 'client')),
    password_hash   TEXT NOT NULL,
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(200) UNIQUE NOT NULL,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'pm', 'supplier', 'client')),
    password_hash   TEXT NOT NULL,
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

#### view type where for each view being upladed the suplier will have to choose what type of view the image belongs to.