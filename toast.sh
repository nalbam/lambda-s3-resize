#!/bin/bash

prepare() {
    TOKEN=""
    ORG=""
}

branch() {
    GIT_BRANCH="`git branch`"

    BRANCH="master"

    while read line
    do
        ARR=(${line})

        if [ "${ARR[0]}" == "*" ]; then
            BRANCH="${ARR[1]}"
        fi
    done < ${GIT_BRANCH}
}

parse() {
    POM_FILE="./pom.xml"

    if [ ! -f "${POM_FILE}" ]; then
        echo "### toast.sh : does not exist pom file. [${POM_FILE}]"
        return 1
    fi

    ARR_GROUP=($(cat ${POM_FILE} | grep -oP '(?<=groupId>)[^<]+'))
    ARR_ARTIFACT=($(cat ${POM_FILE} | grep -oP '(?<=artifactId>)[^<]+'))
    ARR_VERSION=($(cat ${POM_FILE} | grep -oP '(?<=version>)[^<]+'))
    ARR_PACKAGE=($(cat ${POM_FILE} | grep -oP '(?<=packaging>)[^<]+'))

    GROUP_ID=${ARR_GROUP[0]}
    ARTIFACT_ID=${ARR_ARTIFACT[0]}
    VERSION=${ARR_VERSION[0]}
    PACKAGE=${ARR_PACKAGE[0]}

    echo "groupId = [${GROUP_ID}]"
    echo "artifactId = [${ARTIFACT_ID}]"
    echo "version = [${VERSION}]"
    echo "package = [${PACKAGE}]"
}

version() {
    if [ "${GROUP_ID}" == "" ] || [ "${ARTIFACT_ID}" == "" ] || [ "${VERSION}" == "" ]; then
        echo "### toast.sh : empty pom value [${GROUP_ID}][${ARTIFACT_ID}][${VERSION}][${PACKAGE}]"
        exit 1
    fi

    if [ "${TOKEN}" == "" ] || [ "${ORG}" == "" ]; then
        echo "### toast.sh : empty token value [${TOKEN}][${ORG}]"
        exit 1
    fi

    if [ "${BRANCH}" == "" ]; then
        echo "### toast.sh : branch name [${BRANCH}]"
        exit 1
    fi

    if [ "${BRANCH}" != "master" ]; then
        echo "### toast.sh : branch name [${BRANCH}]"
        exit 1
    fi

    URL="${TOAST_URL}/version/latest/${ARTIFACT_ID}"
    RES=`curl -s --data "org=${ORG}&token=${TOKEN}" ${URL}`
    ARR=(${RES})

    if [ "${ARR[0]}" != "OK" ]; then
        echo "### toast.sh : server error. [${URL}][${RES}]"
        return 1
    fi

    VERSION="${ARR[1]}"

    echo "version = [${VERSION}]"

#    DATE=`date +%Y-%m-%d" "%H:%M`
#
#    git tag -a "${VERSION}" -m "at ${DATE} by toast"
#    git push origin "${VERSION}"

    VER1="<version>[0-9a-zA-Z\.\-]\+<\/version>"
    VER2="<version>${VERSION}<\/version>"

    TEMP_FILE="/tmp/toast-pom.tmp"
    if [ -f ${POM_FILE} ]; then
        sed "s/$VER1/$VER2/;10q;" ${POM_FILE} > ${TEMP_FILE}
        sed "1,10d" ${POM_FILE} >> ${TEMP_FILE}
        cp -rf ${TEMP_FILE} ${POM_FILE}
    fi
}

deploy() {
    if [ "${GROUP_ID}" == "" ] || [ "${ARTIFACT_ID}" == "" ] || [ "${VERSION}" == "" ]; then
        echo "### toast.sh : empty pom value [${GROUP_ID}][${ARTIFACT_ID}][${VERSION}][${PACKAGE}]"
        exit 1
    fi

    if [ "${BRANCH}" == "" ]; then
        echo "### toast.sh : branch name [${BRANCH}]"
        exit 1
    fi

    URL="${TOAST_URL}/version/build/${ARTIFACT_ID}/${VERSION}"
    RES=`curl -s --data "org=${ORG}&token=${TOKEN}" ${URL}`
    ARR=(${RES})

    if [ "${ARR[0]}" != "OK" ]; then
        echo "### toast.sh : server error. [${URL}][${RES}]"
    else
        echo "${ARR[1]}"
    fi
}

################################################################################

TOAST_URL="http://toast.sh"

CMD=$1

echo "### toast.sh : ${CMD}"

toast() {
    case "${CMD}" in
        v|version)
            branch
            parse
            version
            ;;
        d|deploy)
            branch
            parse
            deploy
            ;;
    esac
}

toast

echo "### toast.sh : Done."
