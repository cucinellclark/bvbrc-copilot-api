#!/bin/sh

NAME="p3_user"
VERSION=`cat package.json | jq -r .version`;
IMAGE_NAME=$NAME-$VERSION.sif

sudo singularity build $IMAGE_NAME singularity/singularity.def
