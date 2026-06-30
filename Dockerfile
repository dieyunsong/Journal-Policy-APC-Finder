# Copyright (c) 2026, Regents of the University of Michigan. All rights reserved.
# See LICENSE.txt for details.
FROM ruby:3.3@sha256:3e82fd89ddb7367531f78392eb8c9742474e791df2fc12a4ac640d01407c6ae0 AS data

ARG UID=1000
ARG GID=1000
ARG UNAME=app
ENV APP_HOME=/app
ENV BUNDLE_PATH=/bundle


#Create the group for the user
RUN if [ x"${GID}" != x"" ] ; \
    then groupadd ${UNAME} -g ${GID} -o ; \
    else groupadd ${UNAME} ; \
    fi

#Create the User and assign ${APP_HOME} as its home directory
RUN if [ x"${UID}" != x"" ] ; \
    then  useradd -m -d ${APP_HOME} -u ${UID} -o -g ${UNAME} -s /bin/bash ${UNAME} ; \
    else useradd -m -d ${APP_HOME} -g ${UNAME} -s /bin/bash ${UNAME} ; \
    fi

RUN mkdir -p ${BUNDLE_PATH} ${APP_HOME}

WORKDIR ${APP_HOME}
COPY --chown=${UNAME}:${UNAME} Gemfile* ${APP_HOME}/
RUN bundle install
COPY --chown=${UNAME}:${UNAME} . ${APP_HOME}

USER ${UNAME}

CMD ["bin/update"]

FROM httpd:latest@sha256:bdba5c86022f2d6ad0783168b07fe80541fe45e97b434b13ba8c959a5050fb6b AS base

FROM base AS development

FROM base AS production

COPY ./html/ /usr/local/apache2/htdocs/
