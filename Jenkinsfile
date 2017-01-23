#!groovy

//echo "JOB_NAME    ${env.JOB_NAME}"
//echo "BRANCH_NAME ${env.BRANCH_NAME}"

properties([buildDiscarder(logRotator(daysToKeepStr: '60', numToKeepStr: '10')), pipelineTriggers([])])

node {
    stage('Checkout') {
        checkout scm
    }

    stage('Build') {
        if (env.BRANCH_NAME == 'master') {
            sh '~/toaster/toast.sh version next'
        }
        try {
            sh './npm-install.sh'
            sh './lambda.sh'
            notify('Build Passed', 'good')
        } catch (e) {
            notify('Build Failed', 'danger')
            throw e
        }
    }

    stage('Publish') {
        archive 'target/*.jar, target/*.war, target/*.zip'
        sh '~/toaster/toast.sh version save'
        if (toast == 1) {
            sh '/data/deploy/bin/version-dev.sh'
        }
    }
}

def notify(status, color) {
    if (color == 'danger' || env.BRANCH_NAME == 'master') {
        slackSend(color: color, message: "${status}: ${env.JOB_NAME} <${env.BUILD_URL}|#${env.BUILD_NUMBER}>")
    }
}
